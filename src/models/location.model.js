const mongoose = require('mongoose');

const locationSchema = new mongoose.Schema(
  {
    locationId: {
      type: String,
      required: [true, 'Location ID is required'],
      unique: true,
      trim: true,
      uppercase: true,
      minlength: [2, 'Location ID must have at least 2 characters'],
      maxlength: [50, 'Location ID cannot exceed 50 characters']
    },
    name: {
      type: String,
      required: [true, 'Location name/area is required'],
      trim: true,
      minlength: [2, 'Location name/area must have at least 2 characters'],
      maxlength: [100, 'Location name/area cannot exceed 100 characters'],
      alias: 'area'
    },
    district: {
      type: String,
      required: [true, 'District is required'],
      trim: true,
      minlength: [2, 'District must have at least 2 characters'],
      maxlength: [100, 'District cannot exceed 100 characters']
    },
    latitude: {
      type: Number,
      required: [true, 'Latitude is required'],
      min: [-90, 'Latitude must be between -90 and 90'],
      max: [90, 'Latitude must be between -90 and 90']
    },
    longitude: {
      type: Number,
      required: [true, 'Longitude is required'],
      min: [-180, 'Longitude must be between -180 and 180'],
      max: [180, 'Longitude must be between -180 and 180']
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

// Compound or single index for fast lookup
locationSchema.index({ district: 1 });

const Location = mongoose.model('Location', locationSchema);

module.exports = Location;
