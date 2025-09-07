const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const { authenticateToken } = require('./auth');
const { cacheDocument, getCachedDocument, invalidateDocumentCache, getDocumentPresence } = require('../config/redis');

module.exports = (io) => {
  const router = express.Router();

// Create a new document
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { title } = req.body;
    const { userId } = req.user;

    if (!title || title.trim().length === 0) {
      return res.status(400).json({ error: 'Document title is required' });
    }

    if (title.length > 255) {
      return res.status(400).json({ error: 'Title must be 255 characters or less' });
    }

    const document = await db.query(
      'INSERT INTO documents (title, content, created_by) VALUES ($1, $2, $3) RETURNING *',
      [title.trim(), '', userId]
    );

    const newDocument = document.rows[0];

    // Get the creator's username
    const userResult = await db.query('SELECT username FROM users WHERE id = $1', [userId]);
    const creatorUsername = userResult.rows[0]?.username || 'Unknown';

    // Create the document object for broadcasting
    const documentForBroadcast = {
      id: newDocument.id,
      title: newDocument.title,
      content: newDocument.content,
      createdAt: newDocument.created_at,
      updatedAt: newDocument.updated_at,
      version: newDocument.version,
      createdBy: newDocument.created_by,
      createdByUsername: creatorUsername,
      chatMessageCount: 0,
      activeParticipants: 0
    };

    // Broadcast the new document to all connected users
    io.emit('documentCreated', documentForBroadcast);

    res.status(201).json({
      success: true,
      document: {
        id: newDocument.id,
        title: newDocument.title,
        content: newDocument.content,
        createdAt: newDocument.created_at,
        updatedAt: newDocument.updated_at,
        version: newDocument.version,
        createdBy: newDocument.created_by
      }
    });
  } catch (error) {
    console.error('Create document error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all documents with metadata
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const documents = await db.query(`
      SELECT 
        d.*,
        u.username as created_by_username,
        COUNT(DISTINCT cm.id) as chat_message_count
      FROM documents d
      LEFT JOIN users u ON d.created_by = u.id
      LEFT JOIN chat_messages cm ON d.id = cm.document_id
      GROUP BY d.id, u.username
      ORDER BY d.updated_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    // Get total count for pagination
    const totalCount = await db.query('SELECT COUNT(*) FROM documents');
    const total = parseInt(totalCount.rows[0].count);

    // Get active participants for each document
    const documentsWithPresence = await Promise.all(
      documents.rows.map(async (doc) => {
        const presence = await getDocumentPresence(doc.id);
        return {
          id: doc.id,
          title: doc.title,
          content: doc.content,
          createdAt: doc.created_at,
          updatedAt: doc.updated_at,
          version: doc.version,
          createdBy: doc.created_by,
          createdByUsername: doc.created_by_username,
          chatMessageCount: parseInt(doc.chat_message_count),
          activeParticipants: presence.length
        };
      })
    );

    res.json({
      success: true,
      documents: documentsWithPresence,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get documents error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get a specific document
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Try to get from cache first
    const cached = await getCachedDocument(id);
    if (cached) {
      return res.json({
        success: true,
        document: cached
      });
    }

    const document = await db.query(`
      SELECT 
        d.*,
        u.username as created_by_username
      FROM documents d
      LEFT JOIN users u ON d.created_by = u.id
      WHERE d.id = $1
    `, [id]);

    if (document.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const doc = document.rows[0];
    const documentData = {
      id: doc.id,
      title: doc.title,
      content: doc.content,
      createdAt: doc.created_at,
      updatedAt: doc.updated_at,
      version: doc.version,
      createdBy: doc.created_by,
      createdByUsername: doc.created_by_username
    };

    // Cache the document
    await cacheDocument(id, documentData);

    res.json({
      success: true,
      document: documentData
    });
  } catch (error) {
    console.error('Get document error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update document content
router.put('/:id/content', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { content, version } = req.body;
    const { userId } = req.user;

    if (typeof content !== 'string') {
      return res.status(400).json({ error: 'Content must be a string' });
    }

    // Check if document exists and get current version
    const document = await db.query('SELECT version FROM documents WHERE id = $1', [id]);
    
    if (document.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const currentVersion = document.rows[0].version;

    // Simple version check for conflict resolution
    if (version && version !== currentVersion) {
      return res.status(409).json({ 
        error: 'Document has been modified by another user',
        currentVersion,
        clientVersion: version
      });
    }

    // Update document content and increment version
    const updatedDocument = await db.query(
      'UPDATE documents SET content = $1, version = version + 1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [content, id]
    );

    // Invalidate cache
    await invalidateDocumentCache(id);

    res.json({
      success: true,
      document: {
        id: updatedDocument.rows[0].id,
        content: updatedDocument.rows[0].content,
        version: updatedDocument.rows[0].version,
        updatedAt: updatedDocument.rows[0].updated_at
      }
    });
  } catch (error) {
    console.error('Update document error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update document title
router.put('/:id/title', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { title } = req.body;

    if (!title || title.trim().length === 0) {
      return res.status(400).json({ error: 'Document title is required' });
    }

    if (title.length > 255) {
      return res.status(400).json({ error: 'Title must be 255 characters or less' });
    }

    const updatedDocument = await db.query(
      'UPDATE documents SET title = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [title.trim(), id]
    );

    if (updatedDocument.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Invalidate cache
    await invalidateDocumentCache(id);

    res.json({
      success: true,
      document: {
        id: updatedDocument.rows[0].id,
        title: updatedDocument.rows[0].title,
        updatedAt: updatedDocument.rows[0].updated_at
      }
    });
  } catch (error) {
    console.error('Update document title error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete document
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.user;

    // Check if user is the creator (optional: add admin check)
    const document = await db.query('SELECT created_by FROM documents WHERE id = $1', [id]);
    
    if (document.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    if (document.rows[0].created_by !== userId) {
      return res.status(403).json({ error: 'Only the document creator can delete it' });
    }

    await db.query('DELETE FROM documents WHERE id = $1', [id]);

    // Invalidate cache
    await invalidateDocumentCache(id);

    res.json({
      success: true,
      message: 'Document deleted successfully'
    });
  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get document operations history (for conflict resolution)
router.get('/:id/operations', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { since } = req.query;

    let query = `
      SELECT * FROM document_operations 
      WHERE document_id = $1
    `;
    const params = [id];

    if (since) {
      query += ' AND created_at > $2';
      params.push(since);
    }

    query += ' ORDER BY created_at ASC';

    const operations = await db.query(query, params);

    res.json({
      success: true,
      operations: operations.rows
    });
  } catch (error) {
    console.error('Get document operations error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

  return router;
};
