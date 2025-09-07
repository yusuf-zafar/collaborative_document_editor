import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

const Login = () => {
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!username.trim()) {
      setError('Please enter a username');
      return;
    }

    setLoading(true);
    setError('');

    const result = await login(username.trim());
    
    if (!result.success) {
      setError(result.error);
    }
    
    setLoading(false);
  };

  return (
    <div className="login-container">
      <h1 className="login-title">Collaborative Document Editor</h1>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="username" className="form-label">
            Username
          </label>
          <input
            type="text"
            id="username"
            className="input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter your username"
            disabled={loading}
            autoFocus
          />
        </div>
        
        {error && (
          <div className="error">
            {error}
          </div>
        )}
        
        <button
          type="submit"
          className="btn"
          disabled={loading || !username.trim()}
        >
          {loading ? 'Logging in...' : 'Enter Editor'}
        </button>
      </form>
      
      <div style={{ marginTop: '20px', fontSize: '14px', color: '#666', textAlign: 'center' }}>
        <p>Enter any username to start collaborating on documents in real-time!</p>
        <p>Features: Live editing, chat, presence indicators, and more.</p>
      </div>
    </div>
  );
};

export default Login;
