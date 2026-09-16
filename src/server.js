const app = require('./app');
const config = require('./config/env');
const connectDB = require('./config/db');
const mongoose = require('mongoose');

const PORT = config.port;

const startServer = async () => {
  // Connect to Database before starting the HTTP server
  // If connection fails, connectDB terminates the process cleanly
  await connectDB();

  // Start HTTP server
  const server = app.listen(PORT, () => {
    console.log('================================================================');
    console.log(`🚀 ${config.projectName}`);
    console.log(`📍 Pilot Region: ${config.pilotRegion}`);
    console.log(`⚙️  Environment:  ${config.nodeEnv}`);
    console.log(`🌐 Server running on: http://localhost:${PORT}`);
    console.log(`🩺 Health check:      http://localhost:${PORT}/api/health`);
    console.log(`📍 Locations API:     http://localhost:${PORT}/api/locations`);
    console.log('================================================================');
  });

  // Handle graceful termination
  const handleShutdown = (signal) => {
    console.log(`\nReceived ${signal}. Shutting down server gracefully...`);
    server.close(async () => {
      console.log('HTTP server closed.');
      try {
        await mongoose.connection.close();
        console.log('MongoDB connection closed.');
      } catch (err) {
        console.error('Error closing MongoDB connection:', err.message);
      }
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
};

startServer();
