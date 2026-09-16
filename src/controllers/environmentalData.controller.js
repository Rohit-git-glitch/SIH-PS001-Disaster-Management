const EnvironmentalData = require('../models/environmentalData.model');
const Location = require('../models/location.model');

/**
 * Record new environmental and terrain data for a monitoring location
 * POST /api/environmental-data
 */
const createEnvironmentalData = async (req, res, next) => {
  try {
    const {
      locationId,
      rainfall,
      cumulativeRainfall,
      soilMoisture,
      elevation,
      slope,
      aspect,
      ndvi,
      soilClay,
      landCover,
      recordedAt
    } = req.body;

    if (!locationId) {
      return res.status(400).json({
        status: 'fail',
        message: 'Location ID is required.'
      });
    }

    // Verify parent Location exists to prevent orphan environmental records
    const normalizedLocationId = locationId.trim().toUpperCase();
    const locationExists = await Location.findOne({ locationId: normalizedLocationId });

    if (!locationExists) {
      return res.status(404).json({
        status: 'fail',
        message: `Location '${locationId}' not found. Cannot associate environmental data with a non-existent location.`
      });
    }

    const newRecord = new EnvironmentalData({
      locationId: normalizedLocationId,
      rainfall,
      cumulativeRainfall,
      soilMoisture,
      elevation,
      slope,
      aspect,
      ndvi,
      soilClay,
      landCover,
      recordedAt: recordedAt || new Date()
    });

    const savedRecord = await newRecord.save();

    res.status(201).json({
      status: 'success',
      message: 'Environmental data recorded successfully.',
      data: {
        environmentalData: savedRecord
      }
    });
  } catch (error) {
    // Schema validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        status: 'fail',
        message: 'Validation failed: Invalid environmental data provided.',
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
 * Retrieve all environmental records for a specific location (sorted newest first)
 * GET /api/environmental-data/:locationId
 */
const getEnvironmentalDataByLocation = async (req, res, next) => {
  try {
    const { locationId } = req.params;

    if (!locationId) {
      return res.status(400).json({
        status: 'fail',
        message: 'Location ID parameter is required.'
      });
    }

    const normalizedLocationId = locationId.trim().toUpperCase();

    // Verify location exists
    const locationExists = await Location.findOne({ locationId: normalizedLocationId });
    if (!locationExists) {
      return res.status(404).json({
        status: 'fail',
        message: `Location '${locationId}' not found.`
      });
    }

    const records = await EnvironmentalData.find({ locationId: normalizedLocationId })
      .sort({ recordedAt: -1 });

    res.status(200).json({
      status: 'success',
      locationId: normalizedLocationId,
      results: records.length,
      data: {
        records
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Retrieve the latest environmental record for a specific location
 * GET /api/environmental-data/:locationId/latest
 */
const getLatestEnvironmentalDataByLocation = async (req, res, next) => {
  try {
    const { locationId } = req.params;

    if (!locationId) {
      return res.status(400).json({
        status: 'fail',
        message: 'Location ID parameter is required.'
      });
    }

    const normalizedLocationId = locationId.trim().toUpperCase();

    // Verify location exists
    const locationExists = await Location.findOne({ locationId: normalizedLocationId });
    if (!locationExists) {
      return res.status(404).json({
        status: 'fail',
        message: `Location '${locationId}' not found.`
      });
    }

    const latest = await EnvironmentalData.findOne({ locationId: normalizedLocationId })
      .sort({ recordedAt: -1 });

    if (!latest) {
      return res.status(404).json({
        status: 'fail',
        message: `No environmental data records found for location '${locationId}'.`
      });
    }

    res.status(200).json({
      status: 'success',
      locationId: normalizedLocationId,
      data: {
        environmentalData: latest
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createEnvironmentalData,
  getEnvironmentalDataByLocation,
  getLatestEnvironmentalDataByLocation
};
