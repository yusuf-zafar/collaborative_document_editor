# Quick Setup Guide

## 🚀 Getting Started

### Prerequisites
- Node.js (v16+)
- PostgreSQL (v12+)
- Redis (v6+)

### 1. Install All Dependencies
```bash
# Install root dependencies
npm install

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
cd ..
```

### 2. Backend Setup
```bash
# Configure environment
cd backend
cp env.example .env
# Edit .env with your database credentials

# Run database migrations
npm run migrate

# Start the backend server
npm start
```

### 3. Frontend Setup
```bash
# In a new terminal
cd frontend
npm start
```

### 4. Access the Application
- Frontend: http://localhost:3000
- Backend API: http://localhost:3002/api

## 🚀 Quick Start (All at Once)

```bash
# Install all dependencies
npm run install:all

# Start both backend and frontend
npm run start:all
```

## 🐳 Docker Setup (Alternative)

```bash
# Start all services with Docker
docker-compose up -d

# Access the application
# Frontend: http://localhost:3000
# Backend: http://localhost:3002
```

## 🧪 Testing the Setup

```bash
# Run setup tests
npm run test-setup
```

## 📋 Features Implemented

### ✅ Core Features
- **Real-time Collaborative Editing** - Multiple users can edit simultaneously
- **Live Cursors** - See other users' cursor positions
- **Per-Document Chat** - Chat while editing
- **Presence Management** - See who's online
- **User Authentication** - Username-based login
- **Document Management** - Create, edit, delete documents
- **Conflict Resolution** - Last-write-wins with version checking
- **Typing Indicators** - See when others are typing

### 🏗️ Architecture
- **Backend**: Node.js + Express + Socket.IO
- **Database**: PostgreSQL for persistence
- **Cache**: Redis for real-time state
- **Frontend**: React with real-time updates
- **Authentication**: JWT tokens

## 🔧 Configuration

### Environment Variables (.env)
```bash
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=collaborative_docs
DB_USER=postgres
DB_PASSWORD=yusuf

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Server
PORT=3000
JWT_SECRET=your-super-secret-jwt-key

# CORS
SOCKET_IO_CORS_ORIGIN=http://localhost:3001
```

## 🧪 Testing with Multiple Users

1. Open two browser windows/tabs
2. Login with different usernames
3. Create a document in one window
4. Open the document in both windows
5. Edit simultaneously and observe real-time updates
6. Test chat functionality
7. Test presence indicators

## 📊 API Endpoints

### Authentication
- `POST /api/auth/login` - Login with username
- `GET /api/auth/active` - Get active users

### Documents
- `GET /api/documents` - List documents
- `POST /api/documents` - Create document
- `GET /api/documents/:id` - Get document
- `PUT /api/documents/:id/content` - Update content

### Chat
- `GET /api/chat/:documentId` - Get messages
- `POST /api/chat/:documentId` - Send message

## 🔄 Real-time Events

### Client → Server
- `joinDocument` - Join document room
- `documentEdit` - Send edit operation
- `cursorMove` - Send cursor position
- `chatMessage` - Send chat message
- `typing` - Send typing indicator

### Server → Client
- `documentJoined` - Document room joined
- `userJoined` - User joined
- `documentEdit` - Content changed
- `cursorMove` - Cursor moved
- `chatMessage` - New message
- `typing` - Typing indicator

## 🚀 Production Deployment

### Using Docker
```bash
docker-compose up -d
```

### Manual Deployment
1. Set up PostgreSQL and Redis
2. Configure environment variables
3. Run migrations: `npm run migrate`
4. Start backend: `npm start`
5. Build frontend: `cd frontend && npm run build`
6. Serve frontend with nginx/apache

## 📝 Database Schema

The application creates these tables:
- `users` - User accounts
- `documents` - Document metadata
- `chat_messages` - Chat messages
- `document_operations` - Edit operations

## 🔍 Troubleshooting

### Common Issues
1. **Database connection failed**: Check PostgreSQL is running and credentials are correct
2. **Redis connection failed**: Check Redis is running and accessible
3. **Socket connection failed**: Check CORS settings and network connectivity
4. **Migration failed**: Ensure database exists and user has proper permissions

### Logs
- Backend logs: Check console output
- Database logs: Check PostgreSQL logs
- Redis logs: Check Redis logs

## 📚 Documentation

- Full documentation: See README.md
- API reference: See routes/ directory
- Real-time events: See socket/socketHandler.js
- Database schema: See scripts/migrate.js

## 🎉 Success!

Your Real-Time Collaborative Document Editor is now ready! 

Open http://localhost:3001 in your browser and start collaborating! 🚀
