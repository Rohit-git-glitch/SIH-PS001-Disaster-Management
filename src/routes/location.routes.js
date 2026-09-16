const express = require('express');
const router = express.Router();
const locationController = require('../controllers/location.controller');

// GET /api/locations & POST /api/locations
router
  .route('/')
  .get(locationController.getAllLocations)
  .post(locationController.createLocation);

// GET /api/locations/:locationId
router
  .route('/:locationId')
  .get(locationController.getLocationById);

module.exports = router;
