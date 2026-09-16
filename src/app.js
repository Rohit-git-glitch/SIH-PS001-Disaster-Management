const express = require('express');
const cors = require('cors');
const config = require('./config/env');
const apiRoutes = require('./routes');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// Enable Cross-Origin Resource Sharing (CORS)
app.use(cors({
  origin: config.clientUrl === '*' ? '*' : config.clientUrl,
  credentials: true
}));

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Root informational endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    project: config.projectName,
    pilotRegion: config.pilotRegion,
    status: 'online',
    healthCheck: '/api/health',
    version: '1.0.0'
  });
});

// Mount primary API router
app.use('/api', apiRoutes);

// Catch unhandled routes (404 Not Found)
app.use(notFound);

// Centralized global error handling middleware
app.use(errorHandler);

module.exports = app;
