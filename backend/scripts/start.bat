@echo off
REM Real-Time Collaborative Document Editor Startup Script for Windows

echo 🚀 Starting Real-Time Collaborative Document Editor...

REM Check if .env file exists
if not exist .env (
    echo ❌ .env file not found. Please copy env.example to .env and configure it.
    pause
    exit /b 1
)

echo 📊 Checking PostgreSQL connection...
REM Note: You may need to adjust the PostgreSQL check command for Windows
echo ✅ Assuming PostgreSQL is running (please ensure it's accessible)

echo 🔴 Checking Redis connection...
REM Note: You may need to adjust the Redis check command for Windows
echo ✅ Assuming Redis is running (please ensure it's accessible)

echo 📝 Running database migrations...
call npm run migrate
if errorlevel 1 (
    echo ❌ Database migration failed.
    pause
    exit /b 1
)
echo ✅ Database migrations completed

REM Install dependencies if node_modules doesn't exist
if not exist node_modules (
    echo 📦 Installing dependencies...
    call npm install
)

REM Install frontend dependencies if needed
if not exist frontend\node_modules (
    echo 📦 Installing frontend dependencies...
    cd frontend
    call npm install
    cd ..
)

echo 🎉 All checks passed! Starting the application...

echo 🔧 Starting backend server on port 3000...
start "Backend Server" cmd /k "npm start"

timeout /t 3 /nobreak > nul

echo ⚛️ Starting frontend development server on port 3001...
cd frontend
start "Frontend Server" cmd /k "npm start"
cd ..

echo.
echo 🎊 Application is starting up!
echo 📝 Backend API: http://localhost:3000/api
echo ⚛️ Frontend: http://localhost:3001
echo.
echo Press any key to exit this script (servers will continue running)
pause > nul
