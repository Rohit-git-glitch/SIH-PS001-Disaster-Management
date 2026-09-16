const MLPrediction = require('../models/mlPrediction.model');

/**
 * Record metadata for a new ML prediction run
 * POST /api/ml-predictions
 */
const createMLPrediction = async (req, res, next) => {
  try {
    const {
      predictionId,
      modelName,
      modelVersion,
      studyArea,
      outputType,
      fileName,
      filePath,
      crs,
      resolution,
      bounds,
      minProbability,
      maxProbability,
      generatedAt,
      status,
      notes
    } = req.body;

    if (!predictionId) {
      return res.status(400).json({
        status: 'fail',
        message: 'Prediction ID is required.'
      });
    }

    const newPrediction = new MLPrediction({
      predictionId: predictionId.trim(),
      modelName,
      modelVersion,
      studyArea,
      outputType,
      fileName,
      filePath,
      crs,
      resolution,
      bounds,
      minProbability,
      maxProbability,
      generatedAt,
      status,
      notes
    });

    const savedRecord = await newPrediction.save();

    res.status(201).json({
      status: 'success',
      message: 'ML prediction metadata recorded successfully.',
      data: {
        prediction: savedRecord
      }
    });
  } catch (error) {
    // Duplicate predictionId (MongoDB E11000 error)
    if (error.code === 11000) {
      return res.status(409).json({
        status: 'fail',
        message: `Duplicate Error: A prediction with ID '${req.body.predictionId}' already exists.`
      });
    }

    // Schema validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        status: 'fail',
        message: 'Validation failed: Invalid ML prediction data provided.',
        errors: messages
      });
    }

    // Invalid data types / CastError (e.g. invalid date or non-numeric values)
    if (error.name === 'CastError') {
      return res.status(400).json({
        status: 'fail',
        message: `Invalid format for field '${error.path}': Expected valid ${error.kind}.`
      });
    }

    next(error);
  }
};

/**
 * Retrieve all ML prediction metadata records (newest generatedAt first)
 * GET /api/ml-predictions
 */
const getAllMLPredictions = async (req, res, next) => {
  try {
    const predictions = await MLPrediction.find().sort({ generatedAt: -1 });

    res.status(200).json({
      status: 'success',
      results: predictions.length,
      data: {
        predictions
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Retrieve the single latest COMPLETED ML prediction
 * GET /api/ml-predictions/latest
 */
const getLatestCompletedPrediction = async (req, res, next) => {
  try {
    const latest = await MLPrediction.findOne({ status: 'COMPLETED' })
      .sort({ generatedAt: -1 });

    if (!latest) {
      return res.status(404).json({
        status: 'fail',
        message: 'No completed ML predictions found.'
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        prediction: latest
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Retrieve a specific ML prediction by predictionId
 * GET /api/ml-predictions/:predictionId
 */
const getMLPredictionById = async (req, res, next) => {
  try {
    const { predictionId } = req.params;

    if (!predictionId) {
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

    res.status(200).json({
      status: 'success',
      data: {
        prediction
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createMLPrediction,
  getAllMLPredictions,
  getLatestCompletedPrediction,
  getMLPredictionById
};
