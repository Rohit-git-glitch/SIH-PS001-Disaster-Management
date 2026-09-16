const mongoose = require('mongoose');

const environmentalDataSchema = new mongoose.Schema(
  {
    locationId: {
      type: String,
      required: [true, 'Location ID is required'],
      trim: true,
      uppercase: true,
      index: true
    },
    rainfall: {
      type: Number,
      min: [0, 'Rainfall cannot be negative'],
      default: 0
    },
    cumulativeRainfall: {
      type: Number,
      min: [0, 'Cumulative rainfall cannot be negative'],
      default: 0
    },
    soilMoisture: {
      type: Number,
      min: [0, 'Soil moisture cannot be negative'],
      max: [100, 'Soil moisture cannot exceed 100% or ratio > 1.0 (0-100 range)'],
      default: null
    },
    elevation: {
      type: Number,
      min: [0, 'Elevation cannot be negative'],
      default: null
    },
    slope: {
      type: Number,
      min: [0, 'Slope must be between 0 and 90 degrees'],
      max: [90, 'Slope must be between 0 and 90 degrees'],
      default: null
    },
    aspect: {
      type: Number,
      min: [0, 'Aspect must be between 0 and 360 degrees'],
      max: [360, 'Aspect must be between 0 and 360 degrees'],
      default: null
    },
    ndvi: {
      type: Number,
      min: [-1, 'NDVI must be between -1 and 1'],
      max: [1, 'NDVI must be between -1 and 1'],
      default: null
    },
    soilClay: {
      type: Number,
      min: [0, 'Soil clay content cannot be negative'],
      default: null
    },
    landCover: {
      type: String,
      trim: true,
      default: null
    },
    recordedAt: {
      type: Date,
      required: [true, 'recordedAt timestamp is required'],
      validate: {
        validator: function (value) {
          return !isNaN(new Date(value).getTime());
        },
        message: 'recordedAt must be a valid date'
      }
    }
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        delete ret.__v;
        return ret;
      }
    },
    toObject: { virtuals: true }
  }
);

// Compound index for optimized time-series lookups per monitoring location
environmentalDataSchema.index({ locationId: 1, recordedAt: -1 });

const EnvironmentalData = mongoose.model('EnvironmentalData', environmentalDataSchema);

module.exports = EnvironmentalData;
