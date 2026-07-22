const mongoose = require('mongoose');
const dns = require('dns');

// Configure custom DNS if specified, but fall back safely
try {
  dns.setServers(['8.8.8.8', '8.8.4.4']);
  console.log('DNS servers set to Google DNS (8.8.8.8, 8.8.4.4)');
} catch (e) {
  console.warn('Failed to set custom DNS servers, using system default:', e.message);
}

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 45000,
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error connecting to MongoDB: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;

