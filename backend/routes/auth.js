const express = require('express');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const { addActiveUser, removeActiveUser, getActiveUsers } = require('../config/redis');

const router = express.Router();

// Middleware to verify JWT token
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

// Login with username
router.post('/login', async (req, res) => {
  try {
    const { username } = req.body;

    if (!username || username.trim().length === 0) {
      return res.status(400).json({ error: 'Username is required' });
    }

    if (username.length > 50) {
      return res.status(400).json({ error: 'Username must be 50 characters or less' });
    }

    const trimmedUsername = username.trim();

    // Check if user already exists
    let user = await db.query('SELECT * FROM users WHERE username = $1', [trimmedUsername]);

    if (user.rows.length === 0) {
      // Create new user
      const newUser = await db.query(
        'INSERT INTO users (username) VALUES ($1) RETURNING *',
        [trimmedUsername]
      );
      user = newUser;
    } else {
      // Update last_seen for existing user
      await db.query(
        'UPDATE users SET last_seen = NOW() WHERE username = $1',
        [trimmedUsername]
      );
    }

    const userId = user.rows[0].id;
    const usernameValue = user.rows[0].username;

    // Add user to active users in Redis
    await addActiveUser(userId, usernameValue);

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId, 
        username: usernameValue,
        iat: Math.floor(Date.now() / 1000)
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      user: {
        id: userId,
        username: usernameValue,
        createdAt: user.rows[0].created_at
      },
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Logout
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.user;

    // Remove user from active users
    await removeActiveUser(userId);

    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current user info
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.user;

    const user = await db.query('SELECT * FROM users WHERE id = $1', [userId]);

    if (user.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      user: {
        id: user.rows[0].id,
        username: user.rows[0].username,
        createdAt: user.rows[0].created_at,
        lastSeen: user.rows[0].last_seen
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get active users
router.get('/active', async (req, res) => {
  try {
    const activeUsers = await getActiveUsers();
    res.json({
      success: true,
      activeUsers: activeUsers.map(user => ({
        id: user.userId,
        username: user.username,
        lastSeen: user.lastSeen
      }))
    });
  } catch (error) {
    console.error('Get active users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Verify token
router.get('/verify', authenticateToken, (req, res) => {
  res.json({
    success: true,
    user: req.user
  });
});

module.exports = { router, authenticateToken };
