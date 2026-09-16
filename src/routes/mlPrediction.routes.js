const express = require('express');
const router = express.Router();
const mlPredictionController = require('../controllers/mlPrediction.controller');
const mlPredictionRunController = require('../controllers/mlPredictionRun.controller');
const mlPredictionGISController = require('../controllers/mlPredictionGIS.controller');

// POST /api/ml-predictions/run — trigger async ML inference pipeline (Phase 4C)
// Must be declared BEFORE the /:predictionId wildcard route
router.post('/run', mlPredictionRunController.runInferenceHandler);

// POST /api/ml-predictions - Create metadata for an ML prediction run
router.post('/', mlPredictionController.createMLPrediction);

// GET /api/ml-predictions - Retrieve all ML prediction metadata runs
router.get('/', mlPredictionController.getAllMLPredictions);

// GET /api/ml-predictions/latest - Retrieve the latest completed ML prediction
router.get('/latest', mlPredictionController.getLatestCompletedPrediction);

// GET /api/ml-predictions/:predictionId/gis - Retrieve GIS-ready metadata representation (Phase 4D)
router.get('/:predictionId/gis', mlPredictionGISController.getGISMetadata);

// GET /api/ml-predictions/:predictionId/raster - Safely stream probability GeoTIFF raster (Phase 4D)
router.get('/:predictionId/raster', mlPredictionGISController.serveRaster);

// GET /api/ml-predictions/:predictionId - Retrieve a single ML prediction by ID
// Also used to poll the lifecycle status (PROCESSING → COMPLETED / FAILED)
router.get('/:predictionId', mlPredictionController.getMLPredictionById);

module.exports = router;
