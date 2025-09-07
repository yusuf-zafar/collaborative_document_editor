const { Pool } = require('pg');
require('dotenv').config();

async function createDatabase() {
  console.log('🔧 Setting up database...');
  
  // Connect to PostgreSQL without specifying a database
  const adminPool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'yusuf',
    database: 'postgres' // Connect to default postgres database
  });

  try {
    // Check if database exists
    const dbExists = await adminPool.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [process.env.DB_NAME || 'collaborative_docs']
    );

    if (dbExists.rows.length === 0) {
      console.log('📝 Creating database...');
      await adminPool.query(
        `CREATE DATABASE "${process.env.DB_NAME || 'collaborative_docs'}"`
      );
      console.log('✅ Database created successfully');
    } else {
      console.log('✅ Database already exists');
    }

    await adminPool.end();

    // Now connect to the new database and run migrations
    console.log('📝 Running migrations...');
    const { runMigrations } = require('./migrate');
    await runMigrations();
    
    console.log('🎉 Database setup completed successfully!');
  } catch (error) {
    console.error('❌ Database setup failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  createDatabase();
}

module.exports = { createDatabase };
