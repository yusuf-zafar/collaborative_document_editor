const jwt = require('jsonwebtoken');
const db = require('../config/database');
const { 
  addUserToDocument, 
  removeUserFromDocument, 
  getDocumentPresence,
  setUserCursor,
  getUserCursor,
  getAllCursors,
  addActiveUser,
  removeActiveUser,
  getActiveUsers,
  setTypingIndicator,
  getTypingIndicators,
  invalidateDocumentCache
} = require('../config/redis');

// Store active connections
const activeConnections = new Map();

// Function to broadcast document updates to all users
async function broadcastDocumentUpdate(documentId, io) {
  try {
    console.log(`🔄 Broadcasting document update for ${documentId}`);
    
    // Get updated document info with current presence count
    const presence = await getDocumentPresence(documentId);
    console.log(`📊 Current presence count: ${presence.length}`);
    
    // Get document basic info
    const docResult = await db.query(`
      SELECT d.id, d.title, d.content, d.created_at, d.updated_at, d.version, d.created_by,
             u.username as created_by_username,
             COUNT(cm.id) as chat_message_count
      FROM documents d
      LEFT JOIN users u ON d.created_by = u.id
      LEFT JOIN chat_messages cm ON d.id = cm.document_id
      WHERE d.id = $1
      GROUP BY d.id, u.username
    `, [documentId]);

    if (docResult.rows.length > 0) {
      const doc = docResult.rows[0];
      const updatedDocument = {
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

      console.log(`📤 Broadcasting documentUpdated event:`, updatedDocument);
      // Broadcast to all connected users
      io.emit('documentUpdated', updatedDocument);
    } else {
      console.log(`❌ Document ${documentId} not found in database`);
    }
  } catch (error) {
    console.error('Error broadcasting document update:', error);
  }
}

// Document operation batching
const operationBatches = new Map();
const BATCH_DELAY = 1000; // 1 second

// Batch document operations to avoid database overload
function batchDocumentOperation(documentId, operation) {
  if (!operationBatches.has(documentId)) {
    operationBatches.set(documentId, []);
  }
  
  operationBatches.get(documentId).push(operation);
  
  // Clear existing timeout and set new one
  if (operationBatches.get(documentId).timeoutId) {
    clearTimeout(operationBatches.get(documentId).timeoutId);
  }
  
  operationBatches.get(documentId).timeoutId = setTimeout(async () => {
    await flushDocumentOperations(documentId);
  }, BATCH_DELAY);
}

async function flushDocumentOperations(documentId) {
  const operations = operationBatches.get(documentId);
  if (!operations || operations.length === 0) return;
  
  try {
    // Save operations to database
    for (const operation of operations) {
      await db.query(`
        INSERT INTO document_operations (document_id, user_id, operation_type, position, content, length)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        operation.documentId,
        operation.userId,
        operation.type,
        operation.position,
        operation.content,
        operation.length
      ]);
    }
    
    // Update document content and version
    await db.query(`
      UPDATE documents 
      SET content = $1, version = version + 1, updated_at = NOW() 
      WHERE id = $2
    `, [operations[operations.length - 1].finalContent, documentId]);
    
    // Clear the batch
    operationBatches.delete(documentId);
    
    // Invalidate cache
    await invalidateDocumentCache(documentId);
  } catch (error) {
    console.error('Error flushing document operations:', error);
  }
}

// Middleware to authenticate socket connections
const authenticateSocket = async (socket, next) => {
  try {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return next(new Error('Authentication token required'));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.userId;
    socket.username = decoded.username;
    next();
  } catch (error) {
    next(new Error('Invalid authentication token'));
  }
};

module.exports = (io) => {
  // Apply authentication middleware
  io.use(authenticateSocket);

  io.on('connection', async (socket) => {
    console.log(`👤 User ${socket.username} connected (${socket.id})`);
    
    // Add to active users
    await addActiveUser(socket.userId, socket.username);
    activeConnections.set(socket.id, {
      userId: socket.userId,
      username: socket.username,
      currentDocument: null
    });

    // Broadcast updated active users list
    const activeUsers = await getActiveUsers();
    io.emit('activeUsers', activeUsers);

    // Join document room
    socket.on('joinDocument', async (data) => {
      try {
        const { documentId } = data;
        
        // Leave previous document room if any
        if (activeConnections.get(socket.id)?.currentDocument) {
          await socket.leave(activeConnections.get(socket.id).currentDocument);
        }

        // Join new document room
        await socket.join(documentId);
        
        // Update connection info
        const connection = activeConnections.get(socket.id);
        if (connection) {
          connection.currentDocument = documentId;
        }

        // Add user to document presence
        await addUserToDocument(documentId, socket.userId, socket.username);

        // Get current document presence and cursors
        const presence = await getDocumentPresence(documentId);
        const cursors = await getAllCursors(documentId);

        // Send current state to the joining user
        socket.emit('documentJoined', {
          documentId,
          presence,
          cursors
        });

        // Notify others in the document
        socket.to(documentId).emit('userJoined', {
          userId: socket.userId,
          username: socket.username
        });

        // Broadcast document update to all users
        await broadcastDocumentUpdate(documentId, io);

        console.log(`📄 User ${socket.username} joined document ${documentId}`);
      } catch (error) {
        console.error('Join document error:', error);
        socket.emit('error', { message: 'Failed to join document' });
      }
    });

    // Leave document room
    socket.on('leaveDocument', async (data) => {
      try {
        const { documentId } = data;
        
        await socket.leave(documentId);
        
        // Update connection info
        const connection = activeConnections.get(socket.id);
        if (connection) {
          connection.currentDocument = null;
        }

        // Remove user from document presence
        await removeUserFromDocument(documentId, socket.userId);

        // Notify others in the document
        socket.to(documentId).emit('userLeft', {
          userId: socket.userId,
          username: socket.username
        });

        // Broadcast document update to all users
        await broadcastDocumentUpdate(documentId, io);

        console.log(`📄 User ${socket.username} left document ${documentId}`);
      } catch (error) {
        console.error('Leave document error:', error);
      }
    });

    // Handle document editing
    socket.on('documentEdit', async (data) => {
      try {
        const { documentId, operation, content, title } = data;
        const connection = activeConnections.get(socket.id);
        
        if (!connection || connection.currentDocument !== documentId) {
          return;
        }

        // Handle title changes
        if (operation.type === 'title' && title) {
          await db.query('UPDATE documents SET title = $1, updated_at = NOW() WHERE id = $2', [title, documentId]);
          console.log(`📝 Title changed by ${socket.username} in document ${documentId}: "${title}"`);
        } else {
          // Batch the operation for content changes
          batchDocumentOperation(documentId, {
            documentId,
            userId: socket.userId,
            type: operation.type,
            position: operation.position,
            content: operation.content,
            length: operation.length,
            finalContent: content
          });
        }

        // Broadcast to other users in the document
        socket.to(documentId).emit('documentEdit', {
          userId: socket.userId,
          username: socket.username,
          operation,
          content,
          title
        });

      } catch (error) {
        console.error('Document edit error:', error);
        socket.emit('error', { message: 'Failed to process document edit' });
      }
    });

    // Handle cursor movement
    socket.on('cursorMove', async (data) => {
      try {
        const { documentId, cursor } = data;
        const connection = activeConnections.get(socket.id);
        
        if (!connection || connection.currentDocument !== documentId) {
          return;
        }

        // Store cursor in Redis
        await setUserCursor(documentId, socket.userId, {
          ...cursor,
          username: socket.username,
          timestamp: Date.now()
        });

        // Broadcast to other users in the document
        socket.to(documentId).emit('cursorMove', {
          userId: socket.userId,
          username: socket.username,
          cursor
        });

      } catch (error) {
        console.error('Cursor move error:', error);
      }
    });

    // Handle chat messages
    socket.on('chatMessage', async (data) => {
      try {
        const { documentId, message } = data;
        const connection = activeConnections.get(socket.id);
        
        if (!connection || connection.currentDocument !== documentId) {
          return;
        }

        if (!message || message.trim().length === 0) {
          return;
        }

        // Save message to database
        const newMessage = await db.query(`
          INSERT INTO chat_messages (document_id, user_id, username, message)
          VALUES ($1, $2, $3, $4)
          RETURNING *
        `, [documentId, socket.userId, socket.username, message.trim()]);

        // Broadcast to all users in the document
        io.to(documentId).emit('chatMessage', {
          id: newMessage.rows[0].id,
          userId: socket.userId,
          username: socket.username,
          message: newMessage.rows[0].message,
          createdAt: new Date(newMessage.rows[0].created_at).toISOString()
        });

        console.log(`💬 Chat message from ${socket.username} in document ${documentId}`);
      } catch (error) {
        console.error('Chat message error:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Handle typing indicators
    socket.on('typing', async (data) => {
      try {
        const { documentId, isTyping, type = 'chat' } = data; // type: 'chat' or 'editor'
        const connection = activeConnections.get(socket.id);
        
        if (!connection || connection.currentDocument !== documentId) {
          return;
        }

        // Store typing indicator
        await setTypingIndicator(documentId, socket.userId, socket.username, isTyping);

        // Get all typing indicators for the document
        const typingIndicators = await getTypingIndicators(documentId);

        // Broadcast to other users in the document
        socket.to(documentId).emit('typing', {
          userId: socket.userId,
          username: socket.username,
          isTyping,
          type,
          allTyping: typingIndicators
        });

      } catch (error) {
        console.error('Typing indicator error:', error);
      }
    });

    // Handle title changes
    socket.on('titleChange', async (data) => {
      try {
        const { documentId, title, userId, username } = data;
        const connection = activeConnections.get(socket.id);
        
        if (!connection || connection.currentDocument !== documentId) {
          return;
        }

        // Update document title in database
        await db.query('UPDATE documents SET title = $1, updated_at = NOW() WHERE id = $2', [title, documentId]);

        // Broadcast to other users in the document
        socket.to(documentId).emit('titleChange', {
          documentId,
          title,
          userId,
          username
        });

        console.log(`📝 Title changed by ${username} in document ${documentId}: "${title}"`);
      } catch (error) {
        console.error('Title change error:', error);
        socket.emit('error', { message: 'Failed to update title' });
      }
    });

    // Handle document sync request
    socket.on('syncDocument', async (data) => {
      try {
        const { documentId } = data;
        const connection = activeConnections.get(socket.id);
        
        if (!connection || connection.currentDocument !== documentId) {
          return;
        }

        // Get latest document content
        const document = await db.query('SELECT * FROM documents WHERE id = $1', [documentId]);
        
        if (document.rows.length === 0) {
          socket.emit('error', { message: 'Document not found' });
          return;
        }

        // Get recent operations
        const operations = await db.query(`
          SELECT * FROM document_operations 
          WHERE document_id = $1 
          ORDER BY created_at DESC 
          LIMIT 100
        `, [documentId]);

        // Get current presence and cursors
        const presence = await getDocumentPresence(documentId);
        const cursors = await getAllCursors(documentId);

        socket.emit('documentSync', {
          document: document.rows[0],
          operations: operations.rows.reverse(), // Oldest first
          presence,
          cursors
        });

      } catch (error) {
        console.error('Document sync error:', error);
        socket.emit('error', { message: 'Failed to sync document' });
      }
    });

    // Handle disconnect
    socket.on('disconnect', async () => {
      try {
        console.log(`👤 User ${socket.username} disconnected (${socket.id})`);
        
        const connection = activeConnections.get(socket.id);
        if (connection) {
          // Remove from active users
          await removeActiveUser(socket.userId);
          
          // If in a document, remove from presence
          if (connection.currentDocument) {
            await removeUserFromDocument(connection.currentDocument, socket.userId);
            
            // Notify others in the document
            socket.to(connection.currentDocument).emit('userLeft', {
              userId: socket.userId,
              username: socket.username
            });

            // Broadcast document update to all users
            await broadcastDocumentUpdate(connection.currentDocument, io);
          }
        }

        // Remove from active connections
        activeConnections.delete(socket.id);

        // Broadcast updated active users list
        const activeUsers = await getActiveUsers();
        io.emit('activeUsers', activeUsers);

      } catch (error) {
        console.error('Disconnect error:', error);
      }
    });
  });

  // Graceful shutdown - flush all pending operations
  process.on('SIGTERM', async () => {
    console.log('Flushing pending document operations...');
    for (const [documentId, operations] of operationBatches) {
      if (operations.length > 0) {
        await flushDocumentOperations(documentId);
      }
    }
  });

  process.on('SIGINT', async () => {
    console.log('Flushing pending document operations...');
    for (const [documentId, operations] of operationBatches) {
      if (operations.length > 0) {
        await flushDocumentOperations(documentId);
      }
    }
  });
};
