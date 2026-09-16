// src/controllers/mlPredictionGIS.controller.js

/**
 * Controller for Phase 4D — GIS Data Integration & Raster Serving.
 *
 * Endpoints:
 *   GET /api/ml-predictions/:predictionId/gis
 *     Retrieves GIS-oriented metadata (CRS, bounds, resolution, output info, probabilities)
 *     for a COMPLETED prediction run. Status-gated: 409 if PROCESSING or FAILED.
 *
 *   GET /api/ml-predictions/:predictionId/raster
 *     Safely serves the probability GeoTIFF raster file for a COMPLETED prediction run.
 *     Enforces strict path sandboxing inside ML_OUTPUT_DIR to prevent path traversal
 *     and arbitrary filesystem access.
 */

const path = require('path');
const fs = require('fs');
const MLPrediction = require('../models/mlPrediction.model');

// Configuration — ML output directory
const OUTPUT_DIR = process.env.ML_OUTPUT_DIR || path.join(__dirname, '../../ml_inference/outputs');

/**
 * Security helper: Validate that a candidate file path is strictly contained
 * within the approved base output directory.
 *
 * Rules:
 *   - filePath must be a non-empty string
 *   - Must not contain null bytes
 *   - Must not contain traversal segments ("..")
 *   - Resolved absolute path must strictly reside inside allowed base directory
 *
 * @param {string} filePath - Path stored in prediction metadata or requested
 * @param {string} [baseDir] - Base directory to validate against (defaults to OUTPUT_DIR)
 * @returns {string} - Safe resolved absolute path
 * @throws {Error} - Descriptive security or validation error
 */
function validateOutputFilePath(filePath, baseDir = OUTPUT_DIR) {
  if (!filePath || typeof filePath !== 'string' || filePath.trim() === '') {
    throw new Error('File path must be a non-empty string.');
  }

  const trimmed = filePath.trim();

  // Reject null bytes
  if (trimmed.includes('\0')) {
    throw new Error('Null bytes are not permitted in file paths.');
  }

  // Reject path traversal segments
  const normalised = path.normalize(trimmed);
  const segments = normalised.split(/[/\\]/);
  if (segments.includes('..')) {
    throw new Error('Path traversal ("..") is not permitted.');
  }

  const allowedBase = path.resolve(baseDir);
  const resolved = path.resolve(allowedBase, normalised);

  // Enforce containment: resolved path must start with allowedBase + path separator
  if (!resolved.startsWith(allowedBase + path.sep)) {
    throw new Error('Access denied: Resolved file path is outside the approved ML output directory.');
  }

  return resolved;
}

/**
 * GET /api/ml-predictions/:predictionId/gis
 *
 * Exposes GIS metadata for a completed prediction run:
 *   - CRS and spatial bounding coordinates
 *   - Resolution (scalar if projected square pixels, null if geographic/unsafe)
 *   - Output file identification
 *   - Continuous probability statistics [minProbability, maxProbability]
 *   - Generation timestamp and model details
 */
const getGISMetadata = async (req, res, next) => {
  try {
    const { predictionId } = req.params;

    if (!predictionId || predictionId.trim() === '') {
      return res.status(400).json({
        status: 'fail',
        message: 'Prediction ID parameter is required.'
      });
    }

    const prediction = await MLPrediction.findOne({ predictionId: predictionId.trim() });

    if (!prediction) {
      return res.status(404).json({
        status: 'fail',
        message: `ML prediction not found with ID '${predictionId}'.`
      });
    }

    // Status check: GIS metadata is only available once inference succeeds
    if (prediction.status === 'PROCESSING') {
      return res.status(409).json({
        status: 'fail',
        message: 'Prediction is still processing. GIS metadata is only available for COMPLETED predictions.',
        data: {
          predictionId: prediction.predictionId,
          status: prediction.status
        }
      });
    }

    if (prediction.status === 'FAILED') {
      return res.status(409).json({
        status: 'fail',
        message: 'Prediction failed. GIS metadata is not available.',
        data: {
          predictionId: prediction.predictionId,
          status: prediction.status,
          notes: prediction.notes
        }
      });
    }

    // Return GIS-ready metadata representation
    return res.status(200).json({
      status: 'success',
      data: {
        predictionId: prediction.predictionId,
        status: prediction.status,
        outputType: prediction.outputType,
        modelName: prediction.modelName,
        modelVersion: prediction.modelVersion,
        studyArea: prediction.studyArea,
        crs: prediction.crs,
        bounds: prediction.bounds,
        resolution: prediction.resolution,
        fileName: prediction.fileName,
        filePath: prediction.filePath,
        minProbability: prediction.minProbability,
        maxProbability: prediction.maxProbability,
        generatedAt: prediction.generatedAt,
        notes: prediction.notes
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/ml-predictions/:predictionId/raster
 *
 * Securely streams the probability GeoTIFF raster file for a COMPLETED prediction.
 * Validates file existence and verifies that the file resides strictly within
 * the approved ML output directory.
 */
const serveRaster = async (req, res, next) => {
  try {
    const { predictionId } = req.params;

    if (!predictionId || predictionId.trim() === '') {
      return res.status(400).json({
        status: 'fail',
        message: 'Prediction ID parameter is required.'
      });
    }

    const prediction = await MLPrediction.findOne({ predictionId: predictionId.trim() });

    if (!prediction) {
      return res.status(404).json({
        status: 'fail',
        message: `ML prediction not found with ID '${predictionId}'.`
      });
    }

    // Status gating: raster is only available for COMPLETED predictions
    if (prediction.status === 'PROCESSING') {
      return res.status(409).json({
        status: 'fail',
        message: 'Prediction is still processing. Raster file is not available yet.'
      });
    }

    if (prediction.status === 'FAILED') {
      return res.status(409).json({
        status: 'fail',
        message: 'Prediction failed. No raster file was generated.'
      });
    }

    // Validate file path against approved output directory
    let safeFilePath;
    try {
      safeFilePath = validateOutputFilePath(prediction.filePath, OUTPUT_DIR);
    } catch (secErr) {
      return res.status(403).json({
        status: 'fail',
        message: `Security validation failed: ${secErr.message}`
      });
    }

    // Verify physical file exists on disk
    if (!fs.existsSync(safeFilePath)) {
      return res.status(500).json({
        status: 'error',
        message: 'Data integrity error: Raster file is missing from server storage despite completed prediction status.'
      });
    }

    // Set standard GeoTIFF headers
    res.setHeader('Content-Type', 'image/tiff');
    const downloadName = prediction.fileName || path.basename(safeFilePath);
    res.setHeader('Content-Disposition', `inline; filename="${downloadName}"`);

    // Stream file contents safely
    const stream = fs.createReadStream(safeFilePath);
    stream.on('error', (streamErr) => {
      next(streamErr);
    });
    stream.pipe(res);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getGISMetadata,
  serveRaster,
  validateOutputFilePath,
  OUTPUT_DIR
};
