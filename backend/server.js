const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const db = require('./config/database');
const redis = require('./config/redis');
const { router: authRoutes } = require('./routes/auth');
const documentRoutes = require('./routes/documents');
const chatRoutes = require('./routes/chat');
const socketHandler = require('./socket/socketHandler');

const app = express();
const server = http.createServer(app);

// Add trust proxy configuration
app.set('trust proxy', 1);

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Socket.IO setup
const io = socketIo(server, {
  cors: {
    origin: [ process.env.FRONTEND_URL],
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

// Routes (after io initialization)
app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes(io));
app.use('/api/chat', chatRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Initialize socket handler
socketHandler(io);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

const PORT = process.env.PORT;

// Start server
server.listen(PORT, async () => {
  try {
    // Test database connection
    await db.query('SELECT NOW()');
    console.log('✅ Database connected successfully');
    
    // Test Redis connection with more graceful handling
    const { checkRedisHealth } = require('./config/redis');
    try {
        const isRedisHealthy = await checkRedisHealth();
        if (isRedisHealthy) {
            console.log('✅ Redis connected successfully');
        } else {
            console.warn('⚠️ Redis not available, continuing without it');
        }
    } catch (redisError) {
        console.warn('⚠️ Redis connection warning:', redisError.message);
        // Continue starting the server even if Redis isn't ready
    }
    
    console.log(`🚀 Server running on port ${PORT}`);
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
    process.exit(0);
  });
});

module.exports = { app, server, io };
