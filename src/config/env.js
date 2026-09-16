const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config();

const config = {
  port: process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  clientUrl: process.env.CLIENT_URL || '*',
  projectName: 'AI-Based Early Warning and Landslide Risk Monitoring System in NER',
  pilotRegion: 'Assam, Northeast India',
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/landslide_monitoring'
};

module.exports = config;
