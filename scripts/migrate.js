require('dotenv').config();
const Database = require('../src/database/database');

async function runMigrations() {
  console.log('🔄 Starting database migrations...');
  
  try {
    const db = new Database();
    await db.init();
    
    console.log('✅ Migrations completed successfully');
    await db.close();
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migrations if called directly
if (require.main === module) {
  runMigrations();
}

module.exports = runMigrations;