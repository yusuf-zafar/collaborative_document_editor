import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
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
      <div className="container">
        <div className="loading">Loading documents...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="header">
        <div>
          <h1>Document Editor</h1>
          <p>Welcome, {user.username}!</p>
          <div className="presence-list">
            <span style={{ marginRight: '10px', fontSize: '12px', color: '#666' }}>
              Online: {activeUsers.length} users
            </span>
            {activeUsers.slice(0, 5).map((activeUser) => (
              <span key={activeUser.id} className="presence-user">
                {activeUser.username}
              </span>
            ))}
            {activeUsers.length > 5 && (
              <span className="presence-user">
                +{activeUsers.length - 5} more
              </span>
            )}
          </div>
        </div>
        <div>
          <button onClick={logout} className="btn btn-secondary">
            Logout
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Create New Document</h2>
        </div>
        <form onSubmit={handleCreateDocument}>
          <div className="form-group">
            <input
              type="text"
              className="input"
              value={newDocumentTitle}
              onChange={(e) => setNewDocumentTitle(e.target.value)}
              placeholder="Enter document title"
              disabled={creating}
            />
          </div>
          <button
            type="submit"
            className="btn"
            disabled={creating || !newDocumentTitle.trim()}
          >
            {creating ? 'Creating...' : 'Create Document'}
          </button>
        </form>
        {error && <div className="error">{error}</div>}
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Documents</h2>
          <div style={{ fontSize: '12px', color: '#666' }}>
            Connection: {connected ? '🟢 Connected' : '🔴 Disconnected'}
          </div>
        </div>
        
        {documents.length === 0 ? (
          <div className="loading">No documents found. Create your first document above!</div>
        ) : (
          <div className="document-list">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="document-card"
                onClick={() => handleDocumentClick(doc.id)}
              >
                <div className="document-title">{doc.title}</div>
                <div className="document-meta">
                  Created by {doc.createdByUsername || 'Unknown'}
                </div>
                <div className="document-meta">
                  Last updated: {formatDate(doc.updatedAt)}
                </div>
                <div className="document-meta">
                  Chat messages: {doc.chatMessageCount}
                </div>
                <div className="document-participants">
                  👥 {doc.activeParticipants} active
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DocumentList;
