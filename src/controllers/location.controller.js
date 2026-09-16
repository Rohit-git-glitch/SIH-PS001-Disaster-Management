const Location = require('../models/location.model');

/**
 * Create a new Location
 * POST /api/locations
 */
const createLocation = async (req, res, next) => {
  try {
    const { locationId, name, area, district, latitude, longitude } = req.body;

    // Use name or area (alias supported)
    const locationName = name || area;

    const newLocation = new Location({
      locationId,
      name: locationName,
      district,
      latitude,
      longitude
    });

    const savedLocation = await newLocation.save();

    res.status(201).json({
      status: 'success',
      message: 'Location created successfully.',
      data: {
        location: savedLocation
      }
    });
  } catch (error) {
    // Handle Duplicate locationId (MongoDB E11000 error)
    if (error.code === 11000) {
      const duplicateField = Object.keys(error.keyPattern || {})[0] || 'locationId';
      return res.status(409).json({
        status: 'fail',
        message: `Duplicate Error: A location with this ${duplicateField} already exists.`
      });
    }

    // Handle Mongoose Schema Validation Errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        status: 'fail',
        message: 'Validation failed: Invalid location data provided.',
        errors: messages
      });
    }

    // Pass any unexpected database errors to global error handler
    next(error);
  }
};

/**
 * Get all Locations (optional filter by district)
 * GET /api/locations
 */
const getAllLocations = async (req, res, next) => {
  try {
    const { district } = req.query;
    const filter = {};

    if (district) {
      filter.district = new RegExp(`^${district.trim()}$`, 'i');
    }

    const locations = await Location.find(filter).sort({ createdAt: -1 });

    res.status(200).json({
      status: 'success',
      results: locations.length,
      data: {
        locations
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get a single Location by locationId
 * GET /api/locations/:locationId
 */
const getLocationById = async (req, res, next) => {
  try {
    const { locationId } = req.params;

    if (!locationId) {
      return res.status(400).json({
        status: 'fail',
        message: 'Location ID parameter is required.'
      });
    }

    const location = await Location.findOne({
      locationId: locationId.trim().toUpperCase()
    });

    if (!location) {
      return res.status(404).json({
        status: 'fail',
        message: `Location not found with ID '${locationId}'.`
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        location
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createLocation,
  getAllLocations,
  getLocationById
};
