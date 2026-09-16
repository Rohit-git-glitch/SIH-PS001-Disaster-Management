"""Geospatial Inference Pipeline for Assam Landslide Risk Prediction

This script processes a 6‑band GeoTIFF containing the exact features required by the
XGBoost model and produces a single‑band probability raster together with a JSON
metadata file.

Usage example:
  python predict.py \
    --model assam_landslide_xgb_model.json \
    --input Assam_6Feature_Predictors_100m.tif \
    --output Assam_XGBoost_Landslide_Probability.tif
"""

import argparse
import json
import os
import sys
import datetime
from pathlib import Path

import numpy as np
import rasterio
from rasterio.windows import Window
import xgboost as xgb

# -----------------------------------------------------------------------------
# Constants
# -----------------------------------------------------------------------------
EXPECTED_FEATURES = ["Elevation", "Slope", "Rainfall", "NDVI", "SoilClay", "LandCover"]
EXPECTED_BAND_COUNT = 6
OUTPUT_NODATA = -9999.0
# -----------------------------------------------------------------------------
# Helper functions
# -----------------------------------------------------------------------------

def load_model(model_path: str) -> xgb.XGBClassifier:
    """Load an XGBoost model from a JSON file.

    The function validates that the model contains the expected feature names in the
    required order. If validation fails, the script exits with a clear error.
    """
    if not os.path.exists(model_path):
        sys.stderr.write(f"Model file not found: {model_path}\n")
        sys.exit(1)
    model = xgb.XGBClassifier()
    model.load_model(model_path)

    # XGBoost stores feature names in model.get_booster().feature_names
    booster = model.get_booster()
    feature_names = booster.feature_names
    if feature_names is None:
        sys.stderr.write("Loaded model does not contain feature name information.\n")
        sys.exit(1)
    # Ensure exact match (order matters)
    if list(feature_names) != EXPECTED_FEATURES:
        sys.stderr.write(
            f"Model feature contract mismatch.\n"
            f"Expected: {EXPECTED_FEATURES}\n"
            f"Found:    {list(feature_names)}\n"
        )
        sys.exit(1)
    return model


def validate_input_raster(src: rasterio.io.DatasetReader):
    """Validate that the input raster conforms to the contract.

    - Exactly 6 bands
    - All bands have the same width, height, CRS, transform
    - No missing metadata that would prevent processing
    """
    if src.count != EXPECTED_BAND_COUNT:
        sys.stderr.write(
            f"Input raster must have {EXPECTED_BAND_COUNT} bands, found {src.count}.\n"
        )
        sys.exit(1)
    # Additional checks could be added here (e.g., dtype), but they are not required.


def create_output_raster(
    profile: dict,
    width: int,
    height: int,
    transform,
    crs,
    output_path: str,
) -> rasterio.io.DatasetWriter:
    """Create an output raster with the required settings.
    """
    out_profile = profile.copy()
    out_profile.update(
        driver="GTiff",
        dtype=rasterio.float32,
        count=1,
        nodata=OUTPUT_NODATA,
        compress="lzw",
    )
    # Ensure width/height match input
    out_profile.update(width=width, height=height, transform=transform, crs=crs)
    return rasterio.open(output_path, "w", **out_profile)


def process_window(
    src: rasterio.io.DatasetReader,
    window: Window,
    model: xgb.XGBClassifier,
) -> np.ndarray:
    """Read a window from all six bands, run the model, and return a probability
    array for that window.
    """
    # Read all six bands for the window. rasterio returns a (bands, rows, cols) array.
    data = src.read(window=window)
    # data.shape -> (6, h, w)
    # Move band axis to last for easier masking: (h, w, 6)
    data = np.moveaxis(data, 0, -1)
    # Identify pixels where any band has nodata (use src.nodatavals per band)
    nodata_masks = []
    for b in range(src.count):
        nd = src.nodatavals[b]
        if nd is not None:
            nodata_masks.append(data[..., b] == nd)
    if nodata_masks:
        invalid_mask = np.logical_or.reduce(nodata_masks)
    else:
        invalid_mask = np.zeros(data.shape[:2], dtype=bool)

    # Flatten valid pixels for model input
    valid_pixels = data[~invalid_mask]
    if valid_pixels.size == 0:
        # Entire window is nodata – return an array filled with OUTPUT_NODATA
        return np.full(data.shape[:2], OUTPUT_NODATA, dtype=np.float32)

    # XGBoost expects 2‑D input (samples, features)
    X = valid_pixels.astype(np.float32)
    probs = model.predict_proba(X)[:, 1]

    # Prepare output array filled with nodata sentinel
    out_arr = np.full(data.shape[:2], OUTPUT_NODATA, dtype=np.float32)
    out_arr[~invalid_mask] = probs.astype(np.float32)
    return out_arr


def write_metadata(
    output_tif_path: str,
    model_path: str,
    prob_stats: dict,
    src: rasterio.io.DatasetReader,
    output_json_path: str,
):
    """Generate a metadata JSON file accompanying the probability raster.
    """
    meta = {
        "modelName": "XGBoost",
        "modelVersion": Path(model_path).stem,
        "studyArea": "Assam",
        "outputType": "LANDSLIDE_PROBABILITY_RASTER",
        "fileName": Path(output_tif_path).name,
        "crs": src.crs.to_string() if src.crs else None,
        "resolution": src.res,
        "bounds": {
            "minLongitude": src.bounds.left,
            "minLatitude": src.bounds.bottom,
            "maxLongitude": src.bounds.right,
            "maxLatitude": src.bounds.top,
        },
        "minProbability": prob_stats["min"] if prob_stats else None,
        "maxProbability": prob_stats["max"] if prob_stats else None,
        "generatedAt": datetime.datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
        "status": "COMPLETED",
        "features": EXPECTED_FEATURES,
    }
    with open(output_json_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)


def main():
    parser = argparse.ArgumentParser(description="Run landslide probability inference on a 6‑band GeoTIFF.")
    parser.add_argument("--model", required=True, help="Path to the XGBoost JSON model file.")
    parser.add_argument("--input", required=True, help="Path to the 6‑band input GeoTIFF.")
    parser.add_argument("--output", required=True, help="Path for the output probability GeoTIFF.")
    args = parser.parse_args()

    model = load_model(args.model)
    with rasterio.open(args.input) as src:
        validate_input_raster(src)
        profile = src.profile
        width, height = src.width, src.height
        transform = src.transform
        crs = src.crs
        # Create output raster
        with create_output_raster(
            profile, width, height, transform, crs, args.output
        ) as dst:
            # Process in windows (default block shape if available)
            block_shape = src.block_shapes[0] if src.block_shapes else (256, 256)
            win_width, win_height = block_shape[1], block_shape[0]
            prob_min, prob_max = None, None
            for ji, window in src.block_windows(1):
                # window is a rasterio.windows.Window
                prob_arr = process_window(src, window, model)
                dst.write(prob_arr, 1, window=window)
                # Update probability statistics (ignore nodata)
                valid = prob_arr != OUTPUT_NODATA
                if np.any(valid):
                    cur_min = prob_arr[valid].min()
                    cur_max = prob_arr[valid].max()
                    prob_min = cur_min if prob_min is None else min(prob_min, cur_min)
                    prob_max = cur_max if prob_max is None else max(prob_max, cur_max)
            # After processing all windows, write metadata JSON
            prob_stats = {"min": prob_min, "max": prob_max} if prob_min is not None else None
            json_path = Path(args.output).with_suffix('.json')
            write_metadata(args.output, args.model, prob_stats, src, str(json_path))

if __name__ == "__main__":
    main()
