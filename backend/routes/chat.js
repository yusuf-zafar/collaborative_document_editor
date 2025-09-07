const express = require('express');
const db = require('../config/database');
const { authenticateToken } = require('./auth');

const router = express.Router();

// Get chat messages for a document
router.get('/:documentId', authenticateToken, async (req, res) => {
  try {
    const { documentId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    // Verify document exists
    const document = await db.query('SELECT id FROM documents WHERE id = $1', [documentId]);
    if (document.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const messages = await db.query(`
      SELECT 
        cm.*,
        u.username
      FROM chat_messages cm
      LEFT JOIN users u ON cm.user_id = u.id
      WHERE cm.document_id = $1
      ORDER BY cm.created_at DESC
      LIMIT $2 OFFSET $3
    `, [documentId, limit, offset]);

    // Get total count for pagination
    const totalCount = await db.query(
      'SELECT COUNT(*) FROM chat_messages WHERE document_id = $1',
      [documentId]
    );
    const total = parseInt(totalCount.rows[0].count);

    // Format messages with proper date handling
    const formattedMessages = messages.rows.reverse().map(msg => ({
      id: msg.id,
      documentId: msg.document_id,
      userId: msg.user_id,
      username: msg.username,
      message: msg.message,
      createdAt: new Date(msg.created_at).toISOString()
    }));

    res.json({
      success: true,
      messages: formattedMessages,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total,
        hasMore: (parseInt(offset) + parseInt(limit)) < total
      }
    });
  } catch (error) {
    console.error('Get chat messages error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Send a chat message
router.post('/:documentId', authenticateToken, async (req, res) => {
  try {
    const { documentId } = req.params;
    const { message } = req.body;
    const { userId, username } = req.user;

    if (!message || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message content is required' });
    }

    if (message.length > 1000) {
      return res.status(400).json({ error: 'Message must be 1000 characters or less' });
    }

    // Verify document exists
    const document = await db.query('SELECT id FROM documents WHERE id = $1', [documentId]);
    if (document.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const newMessage = await db.query(`
      INSERT INTO chat_messages (document_id, user_id, username, message)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [documentId, userId, username, message.trim()]);

    res.status(201).json({
      success: true,
      message: {
        id: newMessage.rows[0].id,
        documentId: newMessage.rows[0].document_id,
        userId: newMessage.rows[0].user_id,
        username: newMessage.rows[0].username,
        message: newMessage.rows[0].message,
        createdAt: newMessage.rows[0].created_at
      }
    });
  } catch (error) {
    console.error('Send chat message error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete a chat message (only by the author)
router.delete('/:documentId/:messageId', authenticateToken, async (req, res) => {
  try {
    const { documentId, messageId } = req.params;
    const { userId } = req.user;

    // Check if message exists and belongs to user
    const message = await db.query(
      'SELECT id FROM chat_messages WHERE id = $1 AND document_id = $2 AND user_id = $3',
      [messageId, documentId, userId]
    );

    if (message.rows.length === 0) {
      return res.status(404).json({ error: 'Message not found or not authorized to delete' });
    }

    await db.query('DELETE FROM chat_messages WHERE id = $1', [messageId]);

    res.json({
      success: true,
      message: 'Message deleted successfully'
    });
  } catch (error) {
    console.error('Delete chat message error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
