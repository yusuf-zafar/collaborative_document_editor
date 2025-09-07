import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { getUserColor, getUserColorUnique } from '../utils/userColors';
import axios from 'axios';

const Chat = ({ documentId, presence = [], allUserIds = [] }) => {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [typing, setTyping] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  
  // Use the combined user list from DocumentEditor for consistent colors
  const getUserIdsForColors = () => {
    if (allUserIds.length > 0) {
      return allUserIds;
    }
    // Fallback: create local list if allUserIds not provided
    const presenceUserIds = presence.map(u => u.userId);
    const messageUserIds = messages.map(m => m.userId);
    return [...new Set([...presenceUserIds, ...messageUserIds])];
  };
  
  const { user } = useAuth();
  const { socket } = useSocket();
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  useEffect(() => {
    fetchMessages();
    
    if (socket) {
      setupSocketListeners();
    }

    return () => {
      if (socket) {
        cleanupSocketListeners();
      }
    };
  }, [documentId, socket]);

  const setupSocketListeners = () => {
    if (!socket) return;

    socket.on('chatMessage', (message) => {
      if (message.userId === user.id) {
        // This is our own message coming back from the server
        // Replace the temporary message with the real one
        setMessages(prev => prev.map(msg => 
          msg.id && msg.id.toString().startsWith('temp-') ? message : msg
        ));
      } else {
        // This is a message from another user
        setMessages(prev => [...prev, message]);
      }
    });

    socket.on('typing', (data) => {
      if (data.userId !== user.id && data.type === 'chat') {
        setTyping(prev => {
          const filtered = prev.filter(t => t.userId !== data.userId);
          if (data.isTyping) {
            return [...filtered, { userId: data.userId, username: data.username }];
          }
          return filtered;
        });
      }
    });
  };

  const cleanupSocketListeners = () => {
    if (!socket) return;

    socket.off('chatMessage');
    socket.off('typing');
  };

  const fetchMessages = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`/chat/${documentId}`);
      setMessages(response.data.messages);
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    
    if (!newMessage.trim()) return;

    const messageText = newMessage.trim();
    
    // Add message to local state immediately for instant feedback
    const tempMessage = {
      id: `temp-${Date.now()}`, // Temporary ID
      userId: user.id,
      username: user.username,
      message: messageText,
      createdAt: new Date().toISOString()
    };
    
    setMessages(prev => [...prev, tempMessage]);
    setNewMessage('');
    
    // Stop typing indicator
    if (isTyping) {
      setIsTyping(false);
      socket?.emit('typing', { documentId, isTyping: false, type: 'chat' });
    }

    try {
      // Send message via socket for real-time broadcasting
      if (socket) {
        socket.emit('chatMessage', {
          documentId,
          message: messageText
        });
      } else {
        // Fallback to HTTP if socket is not available
        const response = await axios.post(`/chat/${documentId}`, {
          message: messageText
        });
        
        const realMessage = response.data.message;
        setMessages(prev => prev.map(msg => 
          msg.id === tempMessage.id ? realMessage : msg
        ));
      }
    } catch (error) {
      console.error('Error sending message:', error);
      // Remove temp message on error
      setMessages(prev => prev.filter(msg => msg.id !== tempMessage.id));
    }
  };

  const handleMessageChange = (e) => {
    const message = e.target.value;
    setNewMessage(message);
    
    // Send typing indicator
    if (!isTyping && message.trim()) {
      setIsTyping(true);
      socket?.emit('typing', { documentId, isTyping: true, type: 'chat' });
    }
    
    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    // Set new timeout
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      socket?.emit('typing', { documentId, isTyping: false, type: 'chat' });
    }, 1000);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, typing]);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  const formatTime = (message) => {
    // Handle both createdAt and created_at formats
    const dateString = message.createdAt || message.created_at;
    
    if (!dateString) return '--:--';
    
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        return '--:--';
      }
      
      return date.toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    } catch (error) {
      console.warn('Date parsing error:', error, 'for date:', dateString);
      return '--:--';
    }
  };


  if (loading) {
    return (
      <div style={{
        background: 'white',
        borderRadius: '16px',
        boxShadow: '0 10px 40px rgba(0, 0, 0, 0.1)',
        overflow: 'hidden',
        height: '500px',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <div style={{
          padding: '20px',
          borderBottom: '1px solid #f0f0f0',
          background: 'linear-gradient(135deg, #f8f9ff 0%, #ffffff 100%)'
        }}>
          <h3 style={{ 
            margin: 0, 
            fontSize: '18px', 
            fontWeight: '700',
            color: '#2c3e50',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            💬 Chat
          </h3>
        </div>
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#6c757d',
          fontSize: '14px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '20px',
              height: '20px',
              border: '2px solid #667eea',
              borderTop: '2px solid transparent',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }} />
            Loading messages...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      background: 'white',
      borderRadius: '16px',
      boxShadow: '0 10px 40px rgba(0, 0, 0, 0.1)',
      overflow: 'hidden',
      height: '500px',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Chat Header */}
      <div style={{
        padding: '20px',
        borderBottom: '1px solid #f0f0f0',
        background: 'linear-gradient(135deg, #f8f9ff 0%, #ffffff 100%)'
      }}>
        <h3 style={{ 
          margin: 0, 
          fontSize: '18px', 
          fontWeight: '700',
          color: '#2c3e50',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          💬 Chat
        </h3>
        <div style={{
          marginTop: '8px',
          fontSize: '12px',
          color: '#6c757d',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span>💬 {messages.length} messages</span>
          {typing.length > 0 && (
            <>
              <span>•</span>
              <span style={{ color: '#667eea', fontWeight: '500' }}>
                {typing.map(t => t.username).join(', ')} typing...
              </span>
            </>
          )}
        </div>
      </div>
      
      {/* Messages Container */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '16px',
        background: '#fafbfc'
      }}>
        {messages.length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: '#6c757d',
            textAlign: 'center'
          }}>
            <div style={{
              fontSize: '48px',
              marginBottom: '16px',
              opacity: 0.5
            }}>
              💬
            </div>
            <div style={{ fontSize: '16px', fontWeight: '500', marginBottom: '8px' }}>
              No messages yet
            </div>
            <div style={{ fontSize: '14px', opacity: 0.7 }}>
              Start the conversation!
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <div key={message.id} style={{
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px'
            }}>
              {/* User Avatar */}
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: `linear-gradient(135deg, ${getUserColorUnique(message.userId, getUserIdsForColors())}, ${getUserColorUnique(message.userId, getUserIdsForColors())}dd)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontSize: '14px',
                fontWeight: '600',
                flexShrink: 0,
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
              }}>
                {message.username?.charAt(0).toUpperCase()}
              </div>
              
              {/* Message Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '4px'
                }}>
                  <span style={{
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#2c3e50'
                  }}>
                    {message?.username}
                  </span>
                  <span style={{
                    fontSize: '12px',
                    color: '#6c757d'
                  }}>
                    {formatTime(message)}
                  </span>
                </div>
                <div style={{
                  background: 'white',
                  padding: '12px 16px',
                  borderRadius: '18px',
                  fontSize: '14px',
                  lineHeight: '1.5',
                  color: '#2c3e50',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                  border: '1px solid #f0f0f0',
                  wordWrap: 'break-word'
                }}>
                  {message.message}
                </div>
              </div>
            </div>
          ))
        )}
        
        {/* Typing indicators */}
        {typing.length > 0 && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginBottom: '16px',
            padding: '12px 16px',
            background: 'white',
            borderRadius: '18px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
            border: '1px solid #f0f0f0'
          }}>
            <div style={{
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              background: '#667eea',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: '12px',
              fontWeight: '600'
            }}>
              💬
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '2px' }}>
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
              <span style={{ fontSize: '14px', color: '#6c757d' }}>
                {typing.map(t => t.username).join(', ')} typing...
              </span>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>
      
      {/* Input Container */}
      <div style={{
        padding: '16px',
        borderTop: '1px solid #f0f0f0',
        background: 'white'
      }}>
        <form onSubmit={handleSendMessage} style={{
          display: 'flex',
          gap: '12px',
          alignItems: 'flex-end'
        }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <input
              type="text"
              value={newMessage}
              onChange={handleMessageChange}
              placeholder="Type a message..."
              maxLength={1000}
              style={{
                width: '100%',
                padding: '12px 16px',
                border: '2px solid #f0f0f0',
                borderRadius: '25px',
                fontSize: '14px',
                outline: 'none',
                background: '#fafbfc',
                transition: 'all 0.3s ease',
                fontFamily: 'inherit'
              }}
              onFocus={(e) => {
                e.target.style.borderColor = '#667eea';
                e.target.style.background = 'white';
                e.target.style.boxShadow = '0 0 0 3px rgba(102, 126, 234, 0.1)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = '#f0f0f0';
                e.target.style.background = '#fafbfc';
                e.target.style.boxShadow = 'none';
              }}
            />
            <div style={{
              position: 'absolute',
              right: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: '12px',
              color: '#6c757d'
            }}>
              {/* {newMessage.length}/1000 */}
            </div>
          </div>
          <button
            type="submit"
            disabled={!newMessage.trim()}
            style={{
              padding: '12px 20px',
              background: newMessage.trim() ? 'linear-gradient(135deg, #667eea, #764ba2)' : '#e9ecef',
              color: newMessage.trim() ? 'white' : '#6c757d',
              border: 'none',
              borderRadius: '25px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: newMessage.trim() ? 'pointer' : 'not-allowed',
              transition: 'all 0.3s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: newMessage.trim() ? '0 4px 12px rgba(102, 126, 234, 0.3)' : 'none'
            }}
            onMouseOver={(e) => {
              if (newMessage.trim()) {
                e.target.style.transform = 'translateY(-1px)';
                e.target.style.boxShadow = '0 6px 16px rgba(102, 126, 234, 0.4)';
              }
            }}
            onMouseOut={(e) => {
              if (newMessage.trim()) {
                e.target.style.transform = 'translateY(0)';
                e.target.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.3)';
              }
            }}
          >
            <span>Send</span>
            <span style={{ fontSize: '12px' }}>📤</span>
          </button>
        </form>
      </div>

      {/* CSS Animations */}
      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        @keyframes typing {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-8px); }
        }
      `}</style>
    </div>
  );
};

export default Chat;
