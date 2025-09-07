import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import axios from 'axios';
import Chat from './Chat';

const DocumentEditor = () => {
  const { id: documentId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { socket, connected } = useSocket();
  
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [presence, setPresence] = useState([]);
  const [cursors, setCursors] = useState({});
  const [typing, setTyping] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [showChat, setShowChat] = useState(true);
  
  const editorRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const lastContentRef = useRef('');

  useEffect(() => {
    fetchDocument();
  }, [documentId]);

  useEffect(() => {
    if (socket) {
      setupSocketListeners();
      
      // Only join document when socket is connected
      if (socket.connected) {
        socket.emit('joinDocument', { documentId });
      }
      
      // Handle socket connection
      const handleConnect = () => {
        console.log('Socket connected, joining document...');
        socket.emit('joinDocument', { documentId });
      };
      
      // Handle socket reconnection
      const handleReconnect = () => {
        console.log('Socket reconnected, rejoining document...');
        socket.emit('joinDocument', { documentId });
      };
      
      socket.on('connect', handleConnect);
      socket.on('reconnect', handleReconnect);
      
      return () => {
        socket.emit('leaveDocument', { documentId });
        cleanupSocketListeners();
        socket.off('connect', handleConnect);
        socket.off('reconnect', handleReconnect);
      };
    }
  }, [socket, documentId]);

  const setupSocketListeners = () => {
    if (!socket) return;

    socket.on('documentJoined', (data) => {
      // Deduplicate presence list by userId
      const uniquePresence = data.presence.reduce((acc, user) => {
        const exists = acc.some(existingUser => existingUser.userId === user.userId);
        if (!exists) {
          acc.push(user);
        }
        return acc;
      }, []);
      
      setPresence(uniquePresence);
      setCursors(data.cursors);
    });

    socket.on('userJoined', (data) => {
      setPresence(prev => {
        // Check if user already exists (by userId)
        const exists = prev.some(user => user.userId === data.userId);
        if (!exists) {
          return [...prev, data];
        }
        return prev;
      });
    });

    socket.on('userLeft', (data) => {
      setPresence(prev => prev.filter(user => user.userId !== data.userId));
      setCursors(prev => {
        const newCursors = { ...prev };
        delete newCursors[data.userId];
        return newCursors;
      });
    });

    socket.on('documentEdit', (data) => {
      if (data.userId !== user.id) {
        setContent(data.content);
        lastContentRef.current = data.content;
      }
    });

    socket.on('cursorMove', (data) => {
      if (data.userId !== user.id) {
        setCursors(prev => ({
          ...prev,
          [data.userId]: {
            ...data.cursor,
            username: data.username
          }
        }));
      }
    });

    socket.on('typing', (data) => {
      if (data.userId !== user.id) {
        setTyping(prev => {
          const filtered = prev.filter(t => t.userId !== data.userId);
          if (data.isTyping) {
            return [...filtered, { userId: data.userId, username: data.username, type: data.type }];
          }
          return filtered;
        });
      }
    });

    socket.on('documentSync', (data) => {
      setContent(data.document.content);
      setTitle(data.document.title);
      setPresence(data.presence);
      setCursors(data.cursors);
    });

    socket.on('titleChange', (data) => {
      if (data.userId !== user.id) {
        setTitle(data.title);
      }
    });

    socket.on('error', (data) => {
      setError(data.message);
    });

    socket.on('disconnect', () => {
      console.log('Socket disconnected');
    });
  };

  const cleanupSocketListeners = () => {
    if (!socket) return;

    socket.off('documentJoined');
    socket.off('userJoined');
    socket.off('userLeft');
    socket.off('documentEdit');
    socket.off('cursorMove');
    socket.off('typing');
    socket.off('documentSync');
    socket.off('titleChange');
    socket.off('error');
    socket.off('disconnect');
  };

  const fetchDocument = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`/documents/${documentId}`);
      const doc = response.data.document;
      
      setContent(doc.content);
      setTitle(doc.title);
      lastContentRef.current = doc.content;
    } catch (error) {
      console.error('Error fetching document:', error);
      if (error.response?.status === 404) {
        setError('Document not found');
      } else {
        setError('Failed to load document');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleContentChange = useCallback((e) => {
    const newContent = e.target.value;
    setContent(newContent);
    
    // Send typing indicator
    if (!isTyping) {
      setIsTyping(true);
      socket?.emit('typing', { documentId, isTyping: true, type: 'editor' });
    }
    
    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    // Set new timeout
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      socket?.emit('typing', { documentId, isTyping: false, type: 'editor' });
    }, 1000);

    // Send edit to other users
    if (socket && newContent !== lastContentRef.current) {
      socket.emit('documentEdit', {
        documentId,
        operation: {
          type: 'replace',
          content: newContent,
          position: e.target.selectionStart
        },
        content: newContent
      });
      lastContentRef.current = newContent;
    }
  }, [socket, documentId, isTyping]);

  const handleTitleChange = async (e) => {
    const newTitle = e.target.value;
    setTitle(newTitle);
    
    // Send title change to other users immediately
    if (socket) {
      socket.emit('titleChange', {
        documentId,
        title: newTitle,
        userId: user.id,
        username: user.username
      });
    }
    
    // Debounce title updates to database
    if (titleTimeoutRef.current) {
      clearTimeout(titleTimeoutRef.current);
    }
    
    titleTimeoutRef.current = setTimeout(async () => {
      try {
        await axios.put(`/documents/${documentId}/title`, { title: newTitle });
      } catch (error) {
        console.error('Error updating title:', error);
      }
    }, 1000);
  };

  const handleCursorMove = useCallback((e) => {
    if (socket) {
      const rect = e.target.getBoundingClientRect();
      const cursor = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        position: e.target.selectionStart
      };
      
      socket.emit('cursorMove', { documentId, cursor });
    }
  }, [socket, documentId]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = e.target.selectionStart;
      const end = e.target.selectionEnd;
      const newContent = content.substring(0, start) + '  ' + content.substring(end);
      setContent(newContent);
      
      // Update cursor position
      setTimeout(() => {
        e.target.selectionStart = e.target.selectionEnd = start + 2;
      }, 0);
    }
  }, [content]);

  const titleTimeoutRef = useRef(null);

  // Function to get a unique color for each user
  const getUserColor = (userId) => {
    const colors = [
      '#007bff', // Blue
      '#28a745', // Green
      '#dc3545', // Red
      '#ffc107', // Yellow
      '#6f42c1', // Purple
      '#17a2b8', // Cyan
      '#fd7e14', // Orange
      '#e83e8c'  // Pink
    ];
    
    // Get all unique user IDs from cursors
    const userIds = Object.keys(cursors).filter(id => id !== user.id);
    const userIndex = userIds.indexOf(userId);
    
    // If user not found in current cursors, use hash as fallback
    if (userIndex === -1) {
      let hash = 0;
      const str = userId.toString();
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      return colors[Math.abs(hash) % colors.length];
    }
    
    // Assign colors in order to ensure uniqueness
    return colors[userIndex % colors.length];
  };

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      if (titleTimeoutRef.current) {
        clearTimeout(titleTimeoutRef.current);
      }
    };
  }, []);

  if (loading) {
    return (
      <div className="container">
        <div className="loading">Loading document...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container">
        <div className="error">{error}</div>
        <button onClick={() => navigate('/')} className="btn">
          Back to Documents
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="header">
        <div>
          <h1>Document Editor</h1>
          <p>Editing: {title}</p>
          <div className="presence-list">
            <span style={{ marginRight: '10px', fontSize: '12px', color: '#666' }}>
              {presence.length} users online
            </span>
            {presence.map((user) => (
              <span key={user.userId} className="presence-user">
                {user.username}
              </span>
            ))}
          </div>
        </div>
        <div>
          <button 
            onClick={() => setShowChat(!showChat)} 
            className="btn btn-secondary"
            style={{ marginRight: '10px' }}
          >
            {showChat ? 'Hide Chat' : 'Show Chat'}
          </button>
          <button onClick={() => navigate('/')} className="btn btn-secondary">
            Back to Documents
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '20px' }}>
        <div style={{ flex: 1 }}>
          <div className="editor-container">
            <div className="editor-toolbar">
              <input
                type="text"
                value={title}
                onChange={handleTitleChange}
                className="input"
                style={{ border: 'none', background: 'transparent', fontSize: '16px', fontWeight: '600' }}
                placeholder="Document title"
              />
              <div style={{ fontSize: '12px', color: '#666' }}>
                Connection: {connected ? '🟢 Connected' : '🔴 Disconnected'}
              </div>
            </div>
            <textarea
              ref={editorRef}
              className="editor-content"
              value={content}
              onChange={handleContentChange}
              onKeyDown={handleKeyDown}
              onMouseMove={handleCursorMove}
              onKeyUp={handleCursorMove}
              onFocus={handleCursorMove}
              style={{ 
                minHeight: '500px', 
                width: '100%', 
                border: '1px solid #ddd', 
                padding: '10px',
                fontFamily: 'inherit',
                fontSize: '14px',
                lineHeight: '1.5',
                resize: 'vertical'
              }}
              placeholder="Start typing your document..."
            />
            {/* Render cursors - only show other users' cursors */}
            {Object.entries(cursors)
              .filter(([userId]) => userId !== user.id) // Don't show own cursor
              .map(([userId, cursor]) => (
                <div
                  key={userId}
                  className="cursor"
                  style={{
                    left: cursor.x,
                    top: cursor.y + 25, // Position name tag right above cursor
                    backgroundColor: getUserColor(userId)
                  }}
                >
                  {cursor.username}
                </div>
              ))}
          </div>

          {/* Typing indicators */}
          {typing.length > 0 && (
            <div className="typing-indicator">
              {typing.map((user, index) => (
                <span key={user.userId}>
                  {user.username} is typing...
                  {index < typing.length - 1 && ', '}
                </span>
              ))}
            </div>
          )}
        </div>

        {showChat && (
          <div style={{ width: '300px' }}>
            <Chat documentId={documentId} />
          </div>
        )}
      </div>
    </div>
  );
};

export default DocumentEditor;
