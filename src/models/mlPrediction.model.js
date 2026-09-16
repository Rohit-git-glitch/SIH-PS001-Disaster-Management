const mongoose = require('mongoose');

const boundsSchema = new mongoose.Schema(
  {
    minLongitude: {
      type: Number,
      default: null
    },
    minLatitude: {
      type: Number,
      default: null
    },
    maxLongitude: {
      type: Number,
      default: null
    },
    maxLatitude: {
      type: Number,
      default: null
    }
  },
  { _id: false }
);

boundsSchema.pre('validate', function (next) {
  const fields = ['minLongitude', 'minLatitude', 'maxLongitude', 'maxLatitude'];
  for (const f of fields) {
    if (this[f] !== null && this[f] !== undefined) {
      if (typeof this[f] !== 'number' || isNaN(this[f])) {
        this.invalidate(f, `${f} must be a valid number`);
      }
    }
  }
  next();
});

const mlPredictionSchema = new mongoose.Schema(
  {
    predictionId: {
      type: String,
      required: [true, 'Prediction ID is required'],
      unique: true,
      trim: true,
      index: true
    },
    modelName: {
      type: String,
      required: [true, 'Model name is required'],
      default: 'XGBoost',
      trim: true
    },
    modelVersion: {
      type: String,
      required: [true, 'Model version is required'],
      default: 'assam_landslide_xgb_model',
      trim: true
    },
    studyArea: {
      type: String,
      required: [true, 'Study area is required'],
      default: 'Assam',
      trim: true
    },
    outputType: {
      type: String,
      required: [true, 'Output type is required'],
      default: 'LANDSLIDE_PROBABILITY_RASTER',
      trim: true
    },
    fileName: {
      type: String,
      required: [true, 'File name is required'],
      trim: true
    },
    filePath: {
      type: String,
      default: null,
      trim: true
    },
    crs: {
      type: String,
      default: null,
      trim: true
    },
    resolution: {
      type: Number,
      default: null,
      validate: {
        validator: function (val) {
          if (val === null || val === undefined) return true;
          return typeof val === 'number' && val > 0;
        },
        message: 'Resolution must be a positive number (> 0)'
      }
    },
    bounds: {
      type: boundsSchema,
      default: null
    },
    minProbability: {
      type: Number,
      min: [0, 'Minimum probability cannot be less than 0'],
      max: [1, 'Minimum probability cannot exceed 1'],
      default: null
    },
    maxProbability: {
      type: Number,
      min: [0, 'Maximum probability cannot be less than 0'],
      max: [1, 'Maximum probability cannot exceed 1'],
      default: null
    },
    generatedAt: {
      type: Date,
      required: [true, 'generatedAt timestamp is required'],
      validate: {
        validator: function (value) {
          return !isNaN(new Date(value).getTime());
        },
        message: 'generatedAt must be a valid date'
      }
    },
    status: {
      type: String,
      enum: {
        values: ['PROCESSING', 'COMPLETED', 'FAILED'],
        message: 'Status must be one of: PROCESSING, COMPLETED, FAILED'
      },
      default: 'COMPLETED',
      index: true
    },
    notes: {
      type: String,
      default: null,
      trim: true
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

// Compound index for querying latest completed prediction runs
mlPredictionSchema.index({ status: 1, generatedAt: -1 });

const MLPrediction = mongoose.model('MLPrediction', mlPredictionSchema);

module.exports = MLPrediction;
