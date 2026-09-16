const express = require('express');
const router = express.Router();
const environmentalDataController = require('../controllers/environmentalData.controller');

// POST /api/environmental-data
router.post('/', environmentalDataController.createEnvironmentalData);

// GET /api/environmental-data/:locationId/latest
router.get('/:locationId/latest', environmentalDataController.getLatestEnvironmentalDataByLocation);

// GET /api/environmental-data/:locationId
router.get('/:locationId', environmentalDataController.getEnvironmentalDataByLocation);

module.exports = router;
