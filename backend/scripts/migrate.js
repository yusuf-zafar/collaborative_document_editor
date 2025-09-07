const db = require('../config/database');
require('dotenv').config();

const migrations = [
  {
    name: 'create_users_table',
    sql: `
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        username VARCHAR(50) UNIQUE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `
  },
  {
    name: 'create_documents_table',
    sql: `
      CREATE TABLE IF NOT EXISTS documents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title VARCHAR(255) NOT NULL,
        content TEXT DEFAULT '',
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        version INTEGER DEFAULT 1
      );
    `
  },
  {
    name: 'create_chat_messages_table',
    sql: `
      CREATE TABLE IF NOT EXISTS chat_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        username VARCHAR(50) NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `
  },
  {
    name: 'create_document_operations_table',
    sql: `
      CREATE TABLE IF NOT EXISTS document_operations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        operation_type VARCHAR(20) NOT NULL, -- 'insert', 'delete', 'retain'
        position INTEGER NOT NULL,
        content TEXT,
        length INTEGER,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `
  },
  {
    name: 'create_indexes',
    sql: `
      -- Indexes for better performance
      CREATE INDEX IF NOT EXISTS idx_documents_created_by ON documents(created_by);
      CREATE INDEX IF NOT EXISTS idx_documents_updated_at ON documents(updated_at);
      CREATE INDEX IF NOT EXISTS idx_chat_messages_document_id ON chat_messages(document_id);
      CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at);
      CREATE INDEX IF NOT EXISTS idx_document_operations_document_id ON document_operations(document_id);
      CREATE INDEX IF NOT EXISTS idx_document_operations_created_at ON document_operations(created_at);
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    `
  },
  {
    name: 'create_triggers',
    sql: `
      -- Function to update updated_at timestamp
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ language 'plpgsql';

      -- Trigger for documents table
      DROP TRIGGER IF EXISTS update_documents_updated_at ON documents;
      CREATE TRIGGER update_documents_updated_at
        BEFORE UPDATE ON documents
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `
  }
];

async function runMigrations() {
  console.log('🚀 Starting database migrations...');
  
  try {
    // Check if migrations table exists
    await db.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    // Get executed migrations
    const executedMigrations = await db.query('SELECT name FROM migrations');
    const executedNames = executedMigrations.rows.map(row => row.name);

    // Run pending migrations
    for (const migration of migrations) {
      if (!executedNames.includes(migration.name)) {
        console.log(`📝 Running migration: ${migration.name}`);
        await db.query(migration.sql);
        await db.query('INSERT INTO migrations (name) VALUES ($1)', [migration.name]);
        console.log(`✅ Migration ${migration.name} completed`);
      } else {
        console.log(`⏭️  Migration ${migration.name} already executed`);
      }
    }

    console.log('🎉 All migrations completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

// Run migrations if this file is executed directly
if (require.main === module) {
  runMigrations();
}

module.exports = { runMigrations };
