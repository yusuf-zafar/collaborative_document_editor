import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { getUserColor, getUserColorUnique } from '../utils/userColors';
import axios from 'axios';

const DocumentList = () => {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newDocumentTitle, setNewDocumentTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [activeUsers, setActiveUsers] = useState([]);
  
  const { user, logout } = useAuth();
  const { socket, connected } = useSocket();
  const navigate = useNavigate();

  useEffect(() => {
    fetchDocuments();
    fetchActiveUsers();
  }, []);

  useEffect(() => {
    if (socket) {
      socket.on('activeUsers', (users) => {
        setActiveUsers(users);
      });

      // Listen for new document creation
      socket.on('documentCreated', (newDocument) => {
        console.log('📥 Received documentCreated event:', newDocument);
        setDocuments(prev => [newDocument, ...prev]);
      });

      // Listen for document updates (including participant count changes)
      socket.on('documentUpdated', (updatedDocument) => {
        console.log('📥 Received documentUpdated event:', updatedDocument);
        setDocuments(prev => prev.map(doc => 
          doc.id === updatedDocument.id ? updatedDocument : doc
        ));
      });
    }
  }, [socket]);

  const fetchDocuments = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/documents');
      setDocuments(response.data.documents);
    } catch (error) {
      console.error('Error fetching documents:', error);
      setError('Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  const fetchActiveUsers = async () => {
    try {
      const response = await axios.get('/auth/active');
      setActiveUsers(response.data.activeUsers);
    } catch (error) {
      console.error('Error fetching active users:', error);
    }
  };

  const handleCreateDocument = async (e) => {
    e.preventDefault();
    
    if (!newDocumentTitle.trim()) {
      setError('Please enter a document title');
      return;
    }

    try {
      setCreating(true);
      setError('');
      
      const response = await axios.post('/documents', {
        title: newDocumentTitle.trim()
      });
      
      const newDocument = response.data.document;
      navigate(`/documents/${newDocument.id}`);
    } catch (error) {
      console.error('Error creating document:', error);
      setError('Failed to create document');
    } finally {
      setCreating(false);
    }
  };

  const handleDocumentClick = (documentId) => {
    navigate(`/documents/${documentId}`);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  if (loading) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(10px)',
          padding: '40px',
          borderRadius: '16px',
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.1)',
          textAlign: 'center'
        }}>
          <div style={{
            width: '40px',
            height: '40px',
            border: '4px solid #f3f3f3',
            borderTop: '4px solid #667eea',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 20px'
          }} />
          <div style={{ 
            fontSize: '18px', 
            fontWeight: '600',
            color: '#333',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text'
          }}>
            Loading documents...
          </div>
        </div>
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
              📝 Document Editor
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
                background: '#d4edda',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: '500'
              }}>
                <div style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: '#28a745',
                  animation: 'pulse 2s infinite'
                }} />
                Welcome, {user.username}!
              </div>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px',
                fontSize: '14px',
                color: '#666'
              }}>
                <span>👥 {activeUsers.length} online</span>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {activeUsers.slice(0, 3).map((activeUser) => (
                    <div 
                      key={activeUser.id} 
                      title={activeUser.username}
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        background: `linear-gradient(135deg, ${getUserColorUnique(activeUser.id, activeUsers.map(u => u.id))}, ${getUserColorUnique(activeUser.id, activeUsers.map(u => u.id))}dd)`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontSize: '12px',
                        fontWeight: '600',
                        border: '2px solid white',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                        cursor: 'pointer'
                      }}
                    >
                      {activeUser.username.charAt(0).toUpperCase()}
                    </div>
                  ))}
                  {activeUsers.length > 3 && (
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
                      +{activeUsers.length - 3}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          
          <button 
            onClick={logout} 
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
            👋 Logout
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div style={{ 
        padding: '30px',
        maxWidth: '1400px',
        margin: '0 auto'
      }}>
        {/* Create New Document Card */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(10px)',
          borderRadius: '16px',
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.1)',
          padding: '30px',
          marginBottom: '30px',
          border: '1px solid rgba(255, 255, 255, 0.2)'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px',
            paddingBottom: '15px',
            borderBottom: '1px solid #f0f0f0'
          }}>
            <h2 style={{ 
              margin: '0', 
              fontSize: '24px', 
              fontWeight: '700',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text'
            }}>
              ✨ Create New Document
            </h2>
          </div>
          
          <form onSubmit={handleCreateDocument}>
            <div style={{ marginBottom: '20px' }}>
              <input
                type="text"
                value={newDocumentTitle}
                onChange={(e) => setNewDocumentTitle(e.target.value)}
                placeholder="Enter document title..."
                disabled={creating}
                style={{
                  width: '100%',
                  padding: '15px 20px',
                  border: '2px solid #e9ecef',
                  borderRadius: '12px',
                  fontSize: '16px',
                  fontWeight: '500',
                  background: '#f8f9ff',
                  transition: 'all 0.3s ease',
                  outline: 'none'
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = '#667eea';
                  e.target.style.background = 'white';
                  e.target.style.boxShadow = '0 0 0 3px rgba(102, 126, 234, 0.1)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = '#e9ecef';
                  e.target.style.background = '#f8f9ff';
                  e.target.style.boxShadow = 'none';
                }}
              />
            </div>
            <button
              type="submit"
              disabled={creating || !newDocumentTitle.trim()}
              style={{
                padding: '15px 30px',
                background: creating || !newDocumentTitle.trim() 
                  ? '#e9ecef' 
                  : 'linear-gradient(135deg, #667eea, #764ba2)',
                color: creating || !newDocumentTitle.trim() ? '#6c757d' : 'white',
                border: 'none',
                borderRadius: '12px',
                fontSize: '16px',
                fontWeight: '600',
                cursor: creating || !newDocumentTitle.trim() ? 'not-allowed' : 'pointer',
                transition: 'all 0.3s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: creating || !newDocumentTitle.trim() 
                  ? 'none' 
                  : '0 4px 20px rgba(102, 126, 234, 0.3)'
              }}
              onMouseOver={(e) => {
                if (!creating && newDocumentTitle.trim()) {
                  e.target.style.transform = 'translateY(-2px)';
                  e.target.style.boxShadow = '0 6px 25px rgba(102, 126, 234, 0.4)';
                }
              }}
              onMouseOut={(e) => {
                if (!creating && newDocumentTitle.trim()) {
                  e.target.style.transform = 'translateY(0)';
                  e.target.style.boxShadow = '0 4px 20px rgba(102, 126, 234, 0.3)';
                }
              }}
            >
              {creating ? '⏳ Creating...' : '📄 Create Document'}
            </button>
          </form>
          
          {error && (
            <div style={{
              background: '#f8d7da',
              color: '#721c24',
              padding: '12px 16px',
              borderRadius: '8px',
              marginTop: '15px',
              fontSize: '14px',
              fontWeight: '500',
              border: '1px solid #f5c6cb'
            }}>
              ⚠️ {error}
            </div>
          )}
        </div>

        {/* Documents List Card */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(10px)',
          borderRadius: '16px',
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.1)',
          padding: '30px',
          border: '1px solid rgba(255, 255, 255, 0.2)'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '25px',
            paddingBottom: '15px',
            borderBottom: '1px solid #f0f0f0'
          }}>
            <h2 style={{ 
              margin: '0', 
              fontSize: '24px', 
              fontWeight: '700',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text'
            }}>
              📚 Your Documents
            </h2>
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
              {connected ? 'Connected' : 'Disconnected'}
            </div>
          </div>
          
          {documents.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '60px 20px',
              color: '#6c757d',
              fontSize: '16px',
              fontWeight: '500'
            }}>
              <div style={{ fontSize: '48px', marginBottom: '20px' }}>📝</div>
              <div>No documents found. Create your first document above!</div>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
              gap: '20px'
            }}>
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  onClick={() => handleDocumentClick(doc.id)}
                  className="document-card-hover"
                  style={{
                    background: 'white',
                    borderRadius: '12px',
                    padding: '25px',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                    border: '1px solid #e9ecef',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                    position: 'relative',
                    overflow: 'hidden',
                    userSelect: 'none'
                  }}
                >
                  <div style={{
                    fontSize: '20px',
                    fontWeight: '700',
                    marginBottom: '12px',
                    color: '#333',
                    lineHeight: '1.3'
                  }}>
                    {doc.title}
                  </div>
                  
                  <div style={{
                    fontSize: '13px',
                    color: '#6c757d',
                    marginBottom: '15px',
                    lineHeight: '1.6'
                  }}>
                    <div>👤 Created by {doc.createdByUsername || 'Unknown'}</div>
                    <div>🕒 {formatDate(doc.updatedAt)}</div>
                    <div>💬 {doc.chatMessageCount} messages</div>
                  </div>
                  
                  <div style={{
                    paddingTop: '15px',
                    borderTop: '1px solid #f0f0f0',
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#667eea'
                  }}>
                    👥 {doc.activeParticipants} active • Click to open →
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* CSS Animations */}
      <style jsx>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.8); }
          to { opacity: 1; transform: scale(1); }
        }
        
        .document-card-hover:hover {
          transform: translateY(-4px) !important;
          box-shadow: 0 8px 25px rgba(0,0,0,0.15) !important;
          border-color: #667eea !important;
        }
      `}</style>
    </div>
  );
};

export default DocumentList;
