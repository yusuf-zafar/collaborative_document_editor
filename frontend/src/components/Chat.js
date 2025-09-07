import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import axios from 'axios';

const Chat = ({ documentId }) => {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [typing, setTyping] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  
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
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Chat</h3>
        </div>
        <div className="loading">Loading messages...</div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title">Chat</h3>
      </div>
      
      <div className="chat-container">
        <div className="chat-messages">
          {messages.length === 0 ? (
            <div className="loading">No messages yet. Start the conversation!</div>
          ) : (
            messages.map((message) => (
              <div key={message.id} className="chat-message">
                <div className="chat-message-header">
                  <span className="chat-message-author">
                    {message.username}
                  </span>
                  <span className="chat-message-time">
                    {formatTime(message)}
                  </span>
                </div>
                <div className="chat-message-content">
                  {message.message}
                </div>
              </div>
            ))
          )}
          
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
          
          <div ref={messagesEndRef} />
        </div>
        
        <form onSubmit={handleSendMessage} className="chat-input-container">
          <input
            type="text"
            className="chat-input"
            value={newMessage}
            onChange={handleMessageChange}
            placeholder="Type a message..."
            maxLength={1000}
          />
          <button
            type="submit"
            className="btn"
            disabled={!newMessage.trim()}
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
};

export default Chat;
