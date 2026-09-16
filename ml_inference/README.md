# Phase 4B – GeoTIFF‑Based Landslide Probability Inference

This directory implements the **stand‑alone geospatial inference pipeline** required for Phase 4B. The pipeline consumes a **6‑band GeoTIFF** containing the exact features expected by the XGBoost model and produces:

1. A **single‑band probability GeoTIFF** (float32, LZW‑compressed, nodata = -9999) where each pixel holds the landslide‑probability (`predict_proba()[:,1]`).
2. An accompanying **metadata JSON** describing the raster, model, and processing details.

---

## Files
| File | Purpose |
|------|---------|
| `requirements.txt` | Python dependencies (`xgboost`, `numpy`, `rasterio`). |
| `predict.py` | Core inference script – reads a 6‑band raster, validates the contract, runs the XGBoost model, writes the probability raster and metadata JSON. |
| `Dockerfile` | Minimal container to run the inference without installing Python locally. |
| `README.md` | This documentation (you are reading it). |
| `tests/` | Automated pytest suite verifying the pipeline (model loading, band validation, raster processing, output correctness). |

---

## Input Contract
| Requirement | Detail |
|-------------|--------|
| **File** | 6‑band GeoTIFF |
| **Band order** | 1 → Elevation, 2 → Slope, 3 → Rainfall, 4 → NDVI, 5 → SoilClay, 6 → LandCover |
| **Band datatype** | Any numeric type supported by rasterio (will be cast to `float32`). |
| **NoData** | Respect per‑band nodata values; any pixel with nodata in *any* band is written as `-9999` in the output. |
| **CRS / Transform / Resolution / Bounds** | Read directly from the input raster – **do not hard‑code** any spatial reference. |

---

## Output Contract
| Item | Specification |
|------|---------------|
| **Probability raster** | Single‑band GeoTIFF, `dtype=float32`, `nodata=-9999`, `compress=LZW`. Spatial metadata (width, height, transform, CRS, bounds) matches the input raster exactly. |
| **Metadata JSON** | Same basename as the output raster with a `.json` extension. Contains model information, raster metadata, actual probability statistics (min/max over valid pixels), and the six feature names. Example structure:
```json
{
  "modelName": "XGBoost",
  "modelVersion": "assam_landslide_xgb_model",
  "studyArea": "Assam",
  "outputType": "LANDSLIDE_PROBABILITY_RASTER",
  "fileName": "Assam_XGBoost_Landslide_Probability.tif",
  "crs": "EPSG:32645",
  "resolution": [30.0, 30.0],
  "bounds": {
    "minLongitude": 90.0,
    "minLatitude": 26.0,
    "maxLongitude": 95.0,
    "maxLatitude": 28.0
  },
  "minProbability": 0.0123,
  "maxProbability": 0.9876,
  "generatedAt": "2026-09-16T12:34:56Z",
  "status": "COMPLETED",
  "features": ["Elevation","Slope","Rainfall","NDVI","SoilClay","LandCover"]
}
```
---

## CLI Usage
```bash
python predict.py \
  --model assam_landslide_xgb_model.json \
  --input Assam_6Feature_Predictors_100m.tif \
  --output Assam_XGBoost_Landslide_Probability.tif
```
*All paths are **user‑provided** – no hard‑coded absolute locations.*

### Arguments
- `--model` – Path to the XGBoost JSON model (must exist).
- `--input` – Path to the 6‑band predictor GeoTIFF.
- `--output` – Desired path for the probability raster. A metadata JSON with the same basename will be created automatically.

---

## Docker
The provided `Dockerfile` builds an image containing the required Python runtime and the inference script.
```bash
# Build the image (ensure the model file is present in the directory before building)
docker build -t landslide‑inference .

# Run the container (replace the paths with your actual files)
# The model file must be available inside the container; you can mount it if not copied.

docker run --rm \
  -v "$(pwd)/assam_landslide_xgb_model.json:/app/assam_landslide_xgb_model.json" \
  -v "$(pwd)/Assam_6Feature_Predictors_100m.tif:/app/input.tif" \
  landslide‑inference \
  python predict.py --model assam_landslide_xgb_model.json --input input.tif --output probability.tif
```
The container will output `probability.tif` and `probability.json` in the working directory.

---

## NoData Strategy
Pixels where **any** of the six input bands contain the band’s nodata value are considered invalid. The output probability for those pixels is set to `-9999`. These nodata pixels are excluded from probability statistics (`minProbability`, `maxProbability`).

---

## Memory‑Safe Processing
The script reads the input raster **block‑by‑block** (using rasterio’s native `block_windows`). This ensures that even very large rasters are processed with a low memory footprint while preserving exact spatial alignment.

---

## Test Suite
A pytest suite lives in `ml_inference/tests/`. It covers:
- Model loading and feature‑contract validation.
- Correct handling of 6‑band, 5‑band, and 7‑band inputs.
- Output raster properties (band count, dtype, nodata, dimensions, transform, CRS).
- Probability range checks and nodata handling.
- Generation and content verification of the metadata JSON.
- Assurance that existing Phase 3 and Phase 4A backend tests still pass (these are unchanged).

Run the tests with:
```bash
cd ml_inference
pytest tests
```

---

## Limitations
- The script **does not** perform any risk‑category thresholding (those will be added in later phases).
- No GEE export or integration is performed here.
- The model file must be the exact artifact supplied by the ML team; the script does not attempt to reconstruct or retrain the model.

---

*Phase 4B is now complete – the pipeline can be used to generate continuous landslide‑probability rasters from raw predictor data.*
