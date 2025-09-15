require('dotenv').config();
const Database = require('../src/database/database');

async function seedDatabase() {
  console.log('🌱 Seeding database with test data...');
  
  try {
    const db = new Database();
    await db.init();
    
    // Create test users
    const testUsers = [
      {
        telegram_id: 123456789,
        username: 'testuser1',
        first_name: 'Test',
        last_name: 'User1',
        phone: '+1234567890',
        is_subscribed: true,
        is_registered: true
      },
      {
        telegram_id: 987654321,
        username: 'testuser2',
        first_name: 'Test',
        last_name: 'User2',
        phone: '+0987654321',
        is_subscribed: true,
        vip_access: true
      }
    ];
    
    for (const userData of testUsers) {
      await db.createOrUpdateUser(userData);
      if (userData.phone) {
        await db.updateUser(userData.telegram_id, { 
          phone: userData.phone,
          is_subscribed: userData.is_subscribed,
          is_registered: userData.is_registered || false,
          vip_access: userData.vip_access || false
        });
      }
      await db.logUserAction(userData.telegram_id, 'seed_data', { created: true });
    }
    
    // Set test settings
    await db.setSetting('test_mode', 'true');
    await db.setSetting('last_seed', new Date().toISOString());
    
    console.log(`✅ Successfully seeded ${testUsers.length} test users`);
    await db.close();
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
}

// Run seeding if called directly
if (require.main === module) {
  seedDatabase();
}

module.exports = seedDatabase;