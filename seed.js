const mongoose = require('mongoose');
const dotenv = require('dotenv');
const dns = require('dns');
const User = require('./models/User');
const Counter = require('./models/Counter');

// Force Node to use Google DNS for SRV record lookup resolution
try {
  dns.setServers(['8.8.8.8', '8.8.4.4']);
} catch (e) {
  console.warn('Failed to set custom DNS servers in seed:', e.message);
}

dotenv.config();

const seedSystem = async () => {
  try {
    console.log('Connecting to database for seeding...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB Connected.');

    // 1. Seed default counter sequence for members
    const counter = await Counter.findOne({ id: 'memberId' });
    if (!counter) {
      await Counter.create({ id: 'memberId', seq: 1000 });
      console.log('Member sequence counter initialized to 1000.');
    } else {
      console.log('Member sequence counter already exists.');
    }

    // 2. Seed default admin user
    const adminUser = await User.findOne({ username: 'admin' });
    if (!adminUser) {
      await User.create({
        name: 'এডমিন',
        mobile: '01700000000',
        username: 'admin',
        password: 'password123', // Will be hashed by User pre-save hook
        role: 'admin',
        status: 'active'
      });
      console.log('Default Admin user created successfully.');
      console.log('Username: admin');
      console.log('Password: password123');
    } else {
      console.log('Admin user already exists.');
    }

    console.log('Database seeding completed successfully.');
    process.exit(0);
  } catch (error) {
    console.error(`Seeding error: ${error.message}`);
    process.exit(1);
  }
};

seedSystem();
