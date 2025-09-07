const axios = require('axios');
const { createClient } = require('redis');
const { Pool } = require('pg');
require('dotenv').config();

const API_BASE = 'http://localhost:3000/api';

async function testDatabase() {
  console.log('📊 Testing PostgreSQL connection...');
  try {
    const pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'collaborative_docs',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'yusuf',
    });
    
    await pool.query('SELECT NOW()');
    console.log('✅ PostgreSQL connection successful');
    await pool.end();
    return true;
  } catch (error) {
    console.error('❌ PostgreSQL connection failed:', error.message);
    return false;
  }
}

async function testRedis() {
  console.log('🔴 Testing Redis connection...');
  try {
    const redis = createClient({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
    });
    
    await redis.connect();
    await redis.ping();
    console.log('✅ Redis connection successful');
    await redis.quit();
    return true;
  } catch (error) {
    console.error('❌ Redis connection failed:', error.message);
    return false;
  }
}

async function testAPI() {
  console.log('🌐 Testing API endpoints...');
  try {
    // Test health endpoint
    const healthResponse = await axios.get(`${API_BASE}/health`);
    console.log('✅ Health endpoint working');
    
    // Test login
    const loginResponse = await axios.post(`${API_BASE}/auth/login`, {
      username: 'testuser'
    });
    console.log('✅ Authentication working');
    
    // Test document creation
    const token = loginResponse.data.token;
    const docResponse = await axios.post(`${API_BASE}/documents`, {
      title: 'Test Document'
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('✅ Document creation working');
    
    // Test document listing
    const docsResponse = await axios.get(`${API_BASE}/documents`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('✅ Document listing working');
    
    return true;
  } catch (error) {
    console.error('❌ API test failed:', error.message);
    return false;
  }
}

async function runTests() {
  console.log('🧪 Running setup tests...\n');
  
  const dbOk = await testDatabase();
  const redisOk = await testRedis();
  
  if (!dbOk || !redisOk) {
    console.log('\n❌ Prerequisites not met. Please check your database and Redis setup.');
    process.exit(1);
  }
  
  console.log('\n⏳ Waiting for server to start (5 seconds)...');
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  const apiOk = await testAPI();
  
  if (apiOk) {
    console.log('\n🎉 All tests passed! Your setup is ready.');
    console.log('📝 Backend API: http://localhost:3002/api');
    console.log('⚛️ Frontend: http://localhost:3001');
  } else {
    console.log('\n❌ API tests failed. Please check your server setup.');
    process.exit(1);
  }
}

if (require.main === module) {
  runTests();
}

module.exports = { testDatabase, testRedis, testAPI };
