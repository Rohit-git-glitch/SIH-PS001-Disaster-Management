// src/controllers/mlPredictionRun.controller.js

/**
 * Controller for Phase 4C — ML inference orchestration endpoint.
 *
 * POST /api/ml-predictions/run
 *   Accepts a filename (relative to ml_inference/inputs), spawns the Python
 *   inference pipeline asynchronously, and immediately returns the
 *   PROCESSING MLPrediction document.  The caller can poll:
 *   GET /api/ml-predictions/:predictionId  (existing Phase 4A endpoint)
 *   to follow the PROCESSING → COMPLETED / FAILED lifecycle.
 *
 * Security:
 *   - inputPath from the client is treated as a FILENAME ONLY
 *   - Absolute paths, "../" traversal, null bytes are all rejected
 *   - Python executable, model path, and script path are server-side config only
 */

const mlInferenceService = require('../services/mlInference.service');

/**
 * POST /api/ml-predictions/run
 *
 * Request body (JSON):
 *   { "inputPath": "Assam_6Feature_Predictors_100m.tif" }
 *
 * Response 202:
 *   {
 *     "status": "success",
 *     "message": "Inference started. Poll the status endpoint for updates.",
 *     "data": {
 *       "predictionId": "PRED-AS-1726493930000-a1b2c3d4",
 *       "status": "PROCESSING",
 *       "statusEndpoint": "/api/ml-predictions/PRED-AS-1726493930000-a1b2c3d4"
 *     }
 *   }
 *
 * Response 400: missing / invalid inputPath
 * Response 500: unexpected server error
 */
const runInferenceHandler = async (req, res, next) => {
  const { inputPath } = req.body || {};

  // Basic presence check — detailed validation is done in the service
  if (!inputPath || typeof inputPath !== 'string' || inputPath.trim() === '') {
    return res.status(400).json({
      status:  'fail',
      message: 'inputPath is required and must be a non-empty string filename.',
    });
  }

  try {
    const mlDoc = await mlInferenceService.runInference(inputPath.trim());

    return res.status(202).json({
      status:  'success',
      message: 'Inference started. Poll the status endpoint for updates.',
      data: {
        predictionId:   mlDoc.predictionId,
        status:         mlDoc.status,                   // always "PROCESSING" here
        statusEndpoint: `/api/ml-predictions/${mlDoc.predictionId}`,
      },
    });
  } catch (err) {
    // Service throws Error with a descriptive message for validation failures
    const msg = err.message || 'Inference could not be started.';

    // Security / path-validation errors → 400
    const validationPhrases = [
      'Absolute paths',
      'Path traversal',
      'Null bytes',
      'outside the allowed input',
      'non-empty string',
      'not found',
    ];
    const isValidationError = validationPhrases.some((p) => msg.includes(p));

    if (isValidationError) {
      return res.status(400).json({
        status:  'fail',
        message: msg,
      });
    }

    // Pass unexpected errors to the global error handler
    next(err);
  }
};

module.exports = { runInferenceHandler };
