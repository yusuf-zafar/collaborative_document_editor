# Real-Time Collaborative Document Editor

A full-stack real-time collaborative document editor built with Node.js, PostgreSQL, Redis, Socket.IO, and React. Multiple users can edit documents simultaneously with live cursors, chat, and presence management.

## Features

### ✅ Core Features
- **Real-time Collaborative Editing**: Multiple users can edit the same document simultaneously
- **Live Cursors**: See other users' cursor positions in real-time
- **Per-Document Chat**: Chat with other users while editing
- **Presence Management**: See who's currently viewing/editing each document
- **User Authentication**: Simple username-based login system
- **Document Management**: Create, list, and manage documents
- **Conflict Resolution**: Last-write-wins with version checking
- **Typing Indicators**: See when others are typing in chat or editor

### 🏗️ Architecture
- **Backend**: Node.js with Express.js
- **Database**: PostgreSQL for persistence
- **Cache**: Redis for real-time state and presence
- **Real-time**: Socket.IO with Redis adapter for scaling
- **Frontend**: React with real-time updates
- **Authentication**: JWT-based authentication

## Quick Start

### Prerequisites
- Node.js (v16 or higher)
- PostgreSQL (v12 or higher)
- Redis (v6 or higher)

### Installation

1. **Clone and setup backend:**
```bash
# Install dependencies
npm install

# Copy environment file
cp env.example .env

# Edit .env with your database and Redis credentials
# DB_HOST=localhost
# DB_PORT=5432
# DB_NAME=collaborative_docs
# DB_USER=postgres
# DB_PASSWORD=your_password
# REDIS_HOST=localhost
# REDIS_PORT=6379
# JWT_SECRET=your-super-secret-jwt-key

# Run database migrations
npm run migrate

# Start the server
npm start
```

2. **Setup frontend:**
```bash
cd frontend
npm install
npm start
```

3. **Access the application:**
- Frontend: http://localhost:3001
- Backend API: http://localhost:3000/api

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login with username
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Get current user info
- `GET /api/auth/active` - Get active users

### Documents
- `GET /api/documents` - List all documents
- `POST /api/documents` - Create new document
- `GET /api/documents/:id` - Get document by ID
- `PUT /api/documents/:id/content` - Update document content
- `PUT /api/documents/:id/title` - Update document title
- `DELETE /api/documents/:id` - Delete document

### Chat
- `GET /api/chat/:documentId` - Get chat messages
- `POST /api/chat/:documentId` - Send chat message
- `DELETE /api/chat/:documentId/:messageId` - Delete message

## Real-time Events

### Client → Server
- `joinDocument` - Join a document room
- `leaveDocument` - Leave a document room
- `documentEdit` - Send document edit operation
- `cursorMove` - Send cursor position
- `chatMessage` - Send chat message
- `typing` - Send typing indicator

### Server → Client
- `documentJoined` - Document room joined
- `userJoined` - User joined document
- `userLeft` - User left document
- `documentEdit` - Document content changed
- `cursorMove` - Cursor position changed
- `chatMessage` - New chat message
- `typing` - Typing indicator
- `activeUsers` - Active users list updated

## Database Schema

### Users Table
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(50) UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Documents Table
```sql
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  content TEXT DEFAULT '',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  version INTEGER DEFAULT 1
);
```

### Chat Messages Table
```sql
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  username VARCHAR(50) NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## Redis Keys

- `presence:doc:{documentId}` - Set of users in document
- `cursor:doc:{documentId}:{userId}` - User cursor position
- `doc:{documentId}` - Cached document content
- `active:users` - Set of globally active users
- `typing:doc:{documentId}` - Typing indicators per document

## Development

### Running in Development Mode
```bash
# Backend with auto-reload
npm run dev

# Frontend with hot-reload
cd frontend && npm start
```

### Database Migrations
```bash
# Run migrations
npm run migrate

# Create new migration
# Edit scripts/migrate.js and add new migration
```

## Testing

### Manual Testing
1. Open two browser windows/tabs
2. Login with different usernames
3. Create a document in one window
4. Open the document in both windows
5. Edit simultaneously and observe real-time updates
6. Test chat functionality
7. Test presence indicators

### Load Testing
The application is designed to handle multiple concurrent users with:
- Redis adapter for Socket.IO scaling
- Database connection pooling
- Operation batching to reduce DB load
- Efficient presence management

## Deployment

### Environment Variables
```bash
# Database
DB_HOST=your-postgres-host
DB_PORT=5432
DB_NAME=collaborative_docs
DB_USER=your-db-user
DB_PASSWORD=your-db-password

# Redis
REDIS_HOST=your-redis-host
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password

# Server
PORT=3000
NODE_ENV=production
JWT_SECRET=your-super-secret-jwt-key

# CORS
SOCKET_IO_CORS_ORIGIN=https://your-frontend-domain.com
```

### Production Considerations
- Use a reverse proxy (nginx) for SSL termination
- Configure Redis persistence
- Set up database backups
- Use PM2 for process management
- Monitor Redis memory usage
- Set up logging and monitoring

## Architecture Decisions

### Conflict Resolution
- **Last-write-wins** with version checking
- Simple but effective for most use cases
- Version increments on each save
- Client receives 409 conflict error if version mismatch

### Real-time Synchronization
- **Delta-based operations** for efficient updates
- **Operation batching** to reduce database load
- **Redis pub/sub** for multi-instance scaling
- **Presence management** with TTL for cleanup

### Performance Optimizations
- **Document caching** in Redis
- **Connection pooling** for PostgreSQL
- **Operation batching** with 1-second delay
- **Efficient presence tracking** with Redis sets

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Demo

A live demo is available at: https://real-time-collaborat-3fzm.bolt.host

## Support

For issues and questions:
1. Check the GitHub issues
2. Review the documentation
3. Create a new issue with detailed information

---

**Built with ❤️ for real-time collaboration**
