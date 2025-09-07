#!/bin/bash

# Real-Time Collaborative Document Editor Startup Script

echo "🚀 Starting Real-Time Collaborative Document Editor..."

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ .env file not found. Please copy env.example to .env and configure it."
    exit 1
fi

# Load environment variables
export $(cat .env | grep -v '^#' | xargs)

# Check if PostgreSQL is running
echo "📊 Checking PostgreSQL connection..."
if ! pg_isready -h $DB_HOST -p $DB_PORT -U $DB_USER; then
    echo "❌ PostgreSQL is not running or not accessible."
    echo "Please start PostgreSQL and ensure it's accessible at $DB_HOST:$DB_PORT"
    exit 1
fi
echo "✅ PostgreSQL is running"

# Check if Redis is running
echo "🔴 Checking Redis connection..."
if ! redis-cli -h $REDIS_HOST -p $REDIS_PORT ping > /dev/null 2>&1; then
    echo "❌ Redis is not running or not accessible."
    echo "Please start Redis and ensure it's accessible at $REDIS_HOST:$REDIS_PORT"
    exit 1
fi
echo "✅ Redis is running"

# Run database migrations
echo "📝 Running database migrations..."
npm run migrate

if [ $? -ne 0 ]; then
    echo "❌ Database migration failed."
    exit 1
fi
echo "✅ Database migrations completed"

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Install frontend dependencies if needed
if [ ! -d "frontend/node_modules" ]; then
    echo "📦 Installing frontend dependencies..."
    cd frontend
    npm install
    cd ..
fi

echo "🎉 All checks passed! Starting the application..."

# Start the backend server
echo "🔧 Starting backend server on port ${PORT:-3000}..."
npm start &

# Start the frontend development server
echo "⚛️ Starting frontend development server on port 3001..."
cd frontend
npm start &

echo ""
echo "🎊 Application is starting up!"
echo "📝 Backend API: http://localhost:${PORT:-3000}/api"
echo "⚛️ Frontend: http://localhost:3001"
echo ""
echo "Press Ctrl+C to stop all services"

# Wait for any process to exit
wait
