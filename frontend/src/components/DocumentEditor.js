import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { getUserColor, getUserColorUnique } from '../utils/userColors';
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
  const [connectionRestored, setConnectionRestored] = useState(false);
  
  const editorRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const lastContentRef = useRef('');
  const prevConnectedRef = useRef(false);

  useEffect(() => {
    fetchDocument();
  }, [documentId]);

  useEffect(() => {
    if (socket) {
      setupSocketListeners();
      
      // Only join document when socket is connected
      if (socket.connected) {
        console.log('Socket already connected, joining document...');
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
        if (socket.connected) {
          socket.emit('leaveDocument', { documentId });
        }
        cleanupSocketListeners();
        socket.off('connect', handleConnect);
        socket.off('reconnect', handleReconnect);
      };
    }
  }, [socket, documentId]);

  // Effect to handle socket connection restoration
  useEffect(() => {
    if (socket && connected && documentId) {
      console.log('Socket connected, ensuring document join...');
      socket.emit('joinDocument', { documentId });
      
      // Only show connection restored notification if we were previously disconnected
      if (!prevConnectedRef.current) {
        setConnectionRestored(true);
        setTimeout(() => setConnectionRestored(false), 3000);
      }
      
      prevConnectedRef.current = true;
    } else if (!connected) {
      prevConnectedRef.current = false;
    }
  }, [socket, connected, documentId]);

  // Separate effect to sync content changes after reconnection
  useEffect(() => {
    if (socket && connected && documentId && content !== lastContentRef.current) {
      console.log('Syncing local content changes after reconnection...');
      socket.emit('documentEdit', {
        documentId,
        operation: {
          type: 'replace',
          content: content,
          position: 0
        },
        content: content
      });
      lastContentRef.current = content;
    }
  }, [socket, connected, documentId, content]);

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
        // Also update title if it's included in the edit data
        if (data.title !== undefined) {
          setTitle(data.title);
        }
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
    
    // Only send real-time updates if connected
    if (connected && socket) {
      // Send typing indicator
      if (!isTyping) {
        setIsTyping(true);
        socket.emit('typing', { documentId, isTyping: true, type: 'editor' });
      }
      
      // Clear existing timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      
      // Set new timeout
      typingTimeoutRef.current = setTimeout(() => {
        setIsTyping(false);
        socket.emit('typing', { documentId, isTyping: false, type: 'editor' });
      }, 1000);

      // Send edit to other users
      if (newContent !== lastContentRef.current) {
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
    } else {
      // If not connected, still update local content but warn user
      console.warn('Not connected to server - changes will be saved locally only');
    }
  }, [socket, documentId, isTyping, connected]);

  const handleTitleChange = async (e) => {
    const newTitle = e.target.value;
    setTitle(newTitle);
    
    // Send title change as part of document edit if connected
    if (connected && socket) {
      socket.emit('documentEdit', {
        documentId,
        operation: {
          type: 'title',
          title: newTitle
        },
        content: content,
        title: newTitle
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
    if (connected && socket) {
      const rect = e.target.getBoundingClientRect();
      const cursor = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        position: e.target.selectionStart
      };
      
      socket.emit('cursorMove', { documentId, cursor });
    }
  }, [socket, documentId, connected]);

  const handleMouseLeave = useCallback(() => {
    if (connected && socket) {
      // Clear cursor when mouse leaves textarea
      socket.emit('cursorMove', { 
        documentId, 
        cursor: { x: -1, y: -1, position: 0 } // Invalid coordinates to hide cursor
      });
    }
  }, [socket, documentId, connected]);

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

  // Create a combined list of all users for consistent colors across all components
  const getAllUserIds = () => {
    const presenceUserIds = presence.map(u => u.userId);
    const cursorUserIds = Object.keys(cursors);
    const allUserIds = [...new Set([...presenceUserIds, ...cursorUserIds])];
    return allUserIds;
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
    <div style={{ 
      minHeight: '100vh', 
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '0'
    }}>
      {/* Modern Header */}
      <div style={{
        background: 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(10px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.2)',
        padding: '20px 30px',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',
        position: 'sticky',
        top: 0,
        zIndex: 100
      }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          maxWidth: '1400px',
          margin: '0 auto'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <button 
              onClick={() => navigate('/')} 
              style={{
                padding: '10px 20px',
                background: 'white',
                color: '#6c757d',
                border: '2px solid #dee2e6',
                borderRadius: '25px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
              onMouseOver={(e) => {
                e.target.style.background = '#6c757d';
                e.target.style.color = 'white';
                e.target.style.borderColor = '#6c757d';
              }}
              onMouseOut={(e) => {
                e.target.style.background = 'white';
                e.target.style.color = '#6c757d';
                e.target.style.borderColor = '#dee2e6';
              }}
            >
              ← Back to Documents
            </button>
            <div>
              <h1 style={{ 
                margin: '0 0 8px 0', 
                fontSize: '28px', 
                fontWeight: '700',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text'
              }}>
                📝 Collaborative Editor
              </h1>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '20px',
                marginTop: '8px'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 12px',
                  background: connected ? '#d4edda' : '#f8d7da',
                  borderRadius: '20px',
                  fontSize: '12px',
                  fontWeight: '500'
                }}>
                  <div style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: connected ? '#28a745' : '#dc3545',
                    animation: connected ? 'pulse 2s infinite' : 'none'
                  }} />
                  {connected ? 'Live Sync' : 'Disconnected'}
                </div>
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px',
                  fontSize: '14px',
                  color: '#666'
                }}>
                  <span>👥 {presence.length} online</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {presence.slice(0, 3).map((user) => (
                      <div title={user.username} key={user.userId} style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        background: `linear-gradient(135deg, ${getUserColorUnique(user.userId, getAllUserIds())}, ${getUserColorUnique(user.userId, getAllUserIds())}dd)`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontSize: '12px',
                        fontWeight: '600',
                        border: '2px solid white',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                        cursor: 'pointer'
                      }}>
                        {user.username.charAt(0).toUpperCase()}
                      </div>
                    ))}
                    {presence.length > 3 && (
                      <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        background: '#6c757d',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontSize: '12px',
                        fontWeight: '600',
                        border: '2px solid white'
                      }}>
                        +{presence.length - 3}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Chat Toggle Button - Top right */}
          <button 
            onClick={() => setShowChat(!showChat)} 
            style={{
              padding: '10px 20px',
              background: showChat ? 'white' : 'linear-gradient(135deg, #667eea, #764ba2)',
              color: showChat ? '#6c757d' : 'white',
              border: showChat ? '2px solid #dee2e6' : 'none',
              borderRadius: '25px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: showChat ? '0 2px 8px rgba(0,0,0,0.1)' : '0 4px 12px rgba(102, 126, 234, 0.3)'
            }}
            onMouseOver={(e) => {
              if (showChat) {
                e.target.style.background = '#6c757d';
                e.target.style.color = 'white';
                e.target.style.borderColor = '#6c757d';
              } else {
                e.target.style.transform = 'translateY(-1px)';
                e.target.style.boxShadow = '0 6px 16px rgba(102, 126, 234, 0.4)';
              }
            }}
            onMouseOut={(e) => {
              if (showChat) {
                e.target.style.background = 'white';
                e.target.style.color = '#6c757d';
                e.target.style.borderColor = '#dee2e6';
              } else {
                e.target.style.transform = 'translateY(0)';
                e.target.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.3)';
              }
            }}
          >
            {showChat ? '✕' : '💬'}
            {showChat ? ' Hide Chat' : ' Show Chat'}
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div style={{ 
        display: 'flex', 
        gap: '30px', 
        padding: '30px',
        maxWidth: '1400px',
        margin: '0 auto',
        minHeight: 'calc(100vh - 120px)'
      }}>
        <div style={{ flex: 1 }}>
          {/* Modern Editor Container */}
          <div style={{
            background: 'white',
            borderRadius: '16px',
            boxShadow: '0 10px 40px rgba(0, 0, 0, 0.1)',
            overflow: 'hidden',
            position: 'relative'
          }}>
            {/* Title Input */}
            <div style={{
              padding: '30px 30px 20px 30px',
              borderBottom: '1px solid #f0f0f0',
              background: 'linear-gradient(135deg, #f8f9ff 0%, #ffffff 100%)'
            }}>
              <input
                type="text"
                value={title}
                onChange={handleTitleChange}
                style={{ 
                  width: '100%',
                  border: 'none', 
                  background: 'transparent', 
                  fontSize: '24px', 
                  fontWeight: '700',
                  color: '#2c3e50',
                  outline: 'none',
                  padding: '0',
                  fontFamily: 'inherit'
                }}
                placeholder="Untitled Document"
              />
              <div style={{
                marginTop: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                fontSize: '13px',
                color: '#6c757d'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 8px',
                  background: connected ? '#e8f5e8' : '#ffeaea',
                  borderRadius: '12px',
                  fontWeight: '500'
                }}>
                  <div style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: connected ? '#28a745' : '#dc3545'
                  }} />
                  {connected ? 'Live editing' : 'Offline'}
                </div>
                <span>•</span>
                <span>{content.length} characters</span>
                <span>•</span>
                <span>{content.split('\n').length} lines</span>
              </div>
            </div>

            {/* Content Editor */}
            <div style={{ position: 'relative' }}>
              <textarea
                ref={editorRef}
                value={content}
                onChange={handleContentChange}
                onKeyDown={handleKeyDown}
                onMouseMove={handleCursorMove}
                onMouseLeave={handleMouseLeave}
                onKeyUp={handleCursorMove}
                onFocus={handleCursorMove}
                style={{ 
                  width: '100%',
                  minHeight: '500px', 
                  border: 'none',
                  padding: '30px',
                  fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  fontSize: '16px',
                  lineHeight: '1.7',
                  resize: 'none',
                  outline: 'none',
                  background: 'white',
                  color: '#2c3e50'
                }}
                placeholder="Start writing your document here... 

💡 Tip: This editor supports real-time collaboration. Changes will appear instantly for other users!"
              />
              {/* Render cursors - only show other users' cursors */}
              {Object.entries(cursors)
                .filter(([userId]) => userId !== user.id) // Don't show own cursor
                .filter(([userId, cursor]) => cursor.x >= 0 && cursor.y >= 0) // Only show valid coordinates
                .map(([userId, cursor]) => (
                  <div
                    key={userId}
                    style={{
                      position: 'absolute',
                      left: cursor.x,
                      top: cursor.y - 30,
                      background: `linear-gradient(135deg, ${getUserColorUnique(userId, getAllUserIds())}, ${getUserColorUnique(userId, getAllUserIds())}dd)`,
                      color: 'white',
                      padding: '4px 12px',
                      borderRadius: '20px',
                      fontSize: '12px',
                      fontWeight: '600',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                      zIndex: 10,
                      pointerEvents: 'none',
                      border: '2px solid white',
                      animation: 'fadeIn 0.3s ease'
                    }}
                  >
                    {cursor.username}
                  </div>
                ))}
            </div>
          </div>

          {/* Connection restored notification */}
          {connectionRestored && (
            <div style={{
              position: 'fixed',
              top: '30px',
              right: '30px',
              background: 'linear-gradient(135deg, #28a745, #20c997)',
              color: 'white',
              padding: '16px 24px',
              borderRadius: '12px',
              boxShadow: '0 8px 32px rgba(40, 167, 69, 0.3)',
              zIndex: 1000,
              animation: 'slideIn 0.4s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              fontSize: '14px',
              fontWeight: '600',
              border: '1px solid rgba(255,255,255,0.2)'
            }}>
              <div style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: 'white',
                animation: 'pulse 1.5s infinite'
              }} />
              ✨ Connection restored! Syncing changes...
            </div>
          )}

          {/* Typing indicators */}
          {typing.length > 0 && (
            <div style={{
              position: 'fixed',
              bottom: '30px',
              left: '30px',
              background: 'rgba(255, 255, 255, 0.95)',
              backdropFilter: 'blur(10px)',
              padding: '12px 20px',
              borderRadius: '25px',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              fontSize: '14px',
              color: '#6c757d',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              zIndex: 1000
            }}>
              <div style={{
                display: 'flex',
                gap: '2px'
              }}>
                <div style={{
                  width: '4px',
                  height: '4px',
                  borderRadius: '50%',
                  background: '#667eea',
                  animation: 'typing 1.4s infinite ease-in-out'
                }} />
                <div style={{
                  width: '4px',
                  height: '4px',
                  borderRadius: '50%',
                  background: '#667eea',
                  animation: 'typing 1.4s infinite ease-in-out 0.2s'
                }} />
                <div style={{
                  width: '4px',
                  height: '4px',
                  borderRadius: '50%',
                  background: '#667eea',
                  animation: 'typing 1.4s infinite ease-in-out 0.4s'
                }} />
              </div>
              {typing.map((user, index) => (
                <span key={user.userId} style={{ fontWeight: '500' }}>
                  {user.username}
                  {index < typing.length - 1 && ', '}
                </span>
              ))}
              <span>is typing...</span>
            </div>
          )}
        </div>

        {showChat && (
          <div style={{ width: '300px' }}>
            <Chat 
              documentId={documentId} 
              presence={presence}
              allUserIds={getAllUserIds()}
            />
          </div>
        )}
      </div>

      {/* CSS Animations */}
      <style jsx>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        
        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.8); }
          to { opacity: 1; transform: scale(1); }
        }
        
        @keyframes typing {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-10px); }
        }
      `}</style>
    </div>
  );
};

export default DocumentEditor;
