const mongoose = require('mongoose');
const config = require('../config/env');

/**
 * Health check controller
 * Confirms backend is operational and returns runtime information including database connectivity
 * 
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const getHealthStatus = (req, res) => {
  const dbStatusMap = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  };

  res.status(200).json({
    status: 'success',
    message: 'Backend is active and running successfully.',
    project: config.projectName,
    pilotRegion: config.pilotRegion,
    environment: config.nodeEnv,
    database: dbStatusMap[mongoose.connection.readyState] || 'unknown',
    uptime: `${Math.floor(process.uptime())}s`,
    timestamp: new Date().toISOString()
  });
};

module.exports = {
  getHealthStatus
};
