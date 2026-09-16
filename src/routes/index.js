const express = require('express');
const router = express.Router();
const healthRoutes = require('./health.routes');
const locationRoutes = require('./location.routes');
const environmentalDataRoutes = require('./environmentalData.routes');
const mlPredictionRoutes = require('./mlPrediction.routes');

// Mount sub-routers
router.use('/health', healthRoutes);
router.use('/locations', locationRoutes);
router.use('/environmental-data', environmentalDataRoutes);
router.use('/ml-predictions', mlPredictionRoutes);

module.exports = router;
