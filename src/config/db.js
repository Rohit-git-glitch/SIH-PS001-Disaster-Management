const mongoose = require('mongoose');
const config = require('./env');

/**
 * Connect to MongoDB database
 * Ensures backend does not silently run without an active database connection.
 */
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(config.mongoUri, {
      serverSelectionTimeoutMS: 5000 // Fast fail if database is offline (5 seconds)
    });

    console.log(`✅ [MongoDB] Connected successfully to host: ${conn.connection.host}`);
    console.log(`📦 [MongoDB] Database name: ${conn.connection.name}`);

    // Connection event listeners
    mongoose.connection.on('error', (err) => {
      console.error(`❌ [MongoDB] Runtime connection error: ${err.message}`);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️  [MongoDB] Connection disconnected.');
    });

    return conn;
  } catch (error) {
    console.error('================================================================');
    console.error('❌ [MongoDB] Database connection failed!');
    console.error(`⚠️  Reason: ${error.message}`);
    console.error('----------------------------------------------------------------');
    console.error('Troubleshooting tips:');
    console.error('1. If running locally: Ensure MongoDB service is running (e.g. net start MongoDB or mongod)');
    console.error('2. If using MongoDB Atlas: Ensure MONGODB_URI in your .env file is set correctly and IP access is allowed');
    console.error('3. Current MONGODB_URI:', config.mongoUri);
    console.error('================================================================');
    
    // Terminate process with failure code to prevent silent failure
    process.exit(1);
  }
};

module.exports = connectDB;
