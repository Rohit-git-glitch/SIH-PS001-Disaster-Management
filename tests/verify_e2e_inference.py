"""
End-to-End Verification of Phase 4 ML Inference Pipeline
Tests all 19 verification requirements using the real trained XGBoost model
and a deterministic 6-band GeoTIFF input raster.
"""

import os
import sys
import json
import subprocess
from pathlib import Path
import numpy as np
import rasterio
from rasterio.transform import from_origin
import xgboost as xgb

BACKEND_DIR = Path(__file__).resolve().parent.parent
MODEL_PATH = BACKEND_DIR / "assam_landslide_xgb_model.json"
PREDICT_SCRIPT = BACKEND_DIR / "ml_inference" / "predict.py"
SCRATCH_DIR = BACKEND_DIR / "ml_inference" / "outputs" / "__e2e_test__"
SCRATCH_DIR.mkdir(parents=True, exist_ok=True)

INPUT_TIF = SCRATCH_DIR / "synthetic_6band_input.tif"
OUTPUT_TIF = SCRATCH_DIR / "synthetic_probability_output.tif"
OUTPUT_JSON = SCRATCH_DIR / "synthetic_probability_output.json"

EXPECTED_FEATURES = ["Elevation", "Slope", "Rainfall", "NDVI", "SoilClay", "LandCover"]

tests_passed = 0
tests_total = 19

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

def check(condition, desc):
    global tests_passed
    if condition:
        print(f"  [PASS] {desc}")
        tests_passed += 1
    else:
        print(f"  [FAIL] {desc}")
        sys.exit(1)

print("=" * 60)
print("RUNNING END-TO-END ML INFERENCE PIPELINE VERIFICATION")
print("=" * 60)

# 1. Model loads
try:
    clf = xgb.XGBClassifier()
    clf.load_model(str(MODEL_PATH))
    check(True, "1. Model loads successfully via xgb.XGBClassifier().load_model()")
except Exception as e:
    check(False, f"1. Model failed to load: {e}")

# 2. Model version compatibility
try:
    with open(MODEL_PATH, "r", encoding="utf-8") as f:
        model_data = json.load(f)
    saved_version = model_data.get("version")
    check(saved_version == [3, 2, 0], f"2. Model saved version is compatible ([3, 2, 0]) - XGBoost {xgb.__version__}")
except Exception as e:
    check(False, f"2. Model version verification failed: {e}")

# Create synthetic 6-band GeoTIFF
# Band order: 1->Elevation, 2->Slope, 3->Rainfall, 4->NDVI, 5->SoilClay, 6->LandCover
width, height = 20, 20
transform = from_origin(91.0, 26.5, 0.001, 0.001)
crs = "EPSG:4326"

np.random.seed(42)
b1_elev = np.random.uniform(50, 1500, (height, width)).astype(np.float32)
b2_slope = np.random.uniform(0, 60, (height, width)).astype(np.float32)
b3_rain = np.random.uniform(100, 4000, (height, width)).astype(np.float32)
b4_ndvi = np.random.uniform(-0.2, 0.9, (height, width)).astype(np.float32)
b5_clay = np.random.uniform(5, 50, (height, width)).astype(np.float32)
b6_cover = np.random.randint(10, 100, (height, width)).astype(np.float32)

# Introduce nodata pixel at [0, 0] to test nodata handling
b1_elev[0, 0] = -9999.0

with rasterio.open(
    str(INPUT_TIF),
    "w",
    driver="GTiff",
    height=height,
    width=width,
    count=6,
    dtype=rasterio.float32,
    crs=crs,
    transform=transform,
    nodata=-9999.0,
) as dst:
    for idx, band_data in enumerate([b1_elev, b2_slope, b3_rain, b4_ndvi, b5_clay, b6_cover], start=1):
        dst.write(band_data, idx)

# 3. Six bands are read
with rasterio.open(str(INPUT_TIF)) as src:
    check(src.count == 6, "3. Six bands are present and read from input GeoTIFF")

# 4. Band order is correct
booster = clf.get_booster()
model_features = list(booster.feature_names)
check(model_features == EXPECTED_FEATURES, f"4. Band order matches contract: {EXPECTED_FEATURES}")

# 5. Prediction executes via predict.py CLI
cmd = [
    sys.executable,
    str(PREDICT_SCRIPT),
    "--model", str(MODEL_PATH),
    "--input", str(INPUT_TIF),
    "--output", str(OUTPUT_TIF),
]
proc = subprocess.run(cmd, capture_output=True, text=True)
check(proc.returncode == 0, f"5. Prediction CLI executed with return code 0 (stderr: {proc.stderr.strip()})")

# 6. Probability values are produced
with rasterio.open(str(OUTPUT_TIF)) as out_src:
    prob_band = out_src.read(1)
    valid_mask = prob_band != -9999.0
    check(np.any(valid_mask), "6. Probability values are successfully produced across valid raster cells")

# 7. Output GeoTIFF is created
check(OUTPUT_TIF.exists() and OUTPUT_TIF.stat().st_size > 0, "7. Output GeoTIFF file is created on disk")

# 8. Output is one-band float32
with rasterio.open(str(OUTPUT_TIF)) as out_src:
    check(out_src.count == 1 and out_src.dtypes[0] == "float32", f"8. Output raster is single-band float32 (count: {out_src.count}, dtype: {out_src.dtypes[0]})")

# 9. Output NoData is -9999
with rasterio.open(str(OUTPUT_TIF)) as out_src:
    check(out_src.nodata == -9999.0 and out_src.read(1)[0, 0] == -9999.0, f"9. Output raster NoData sentinel is -9999.0 and nodata pixels are masked")

# 10. Probability values remain in [0, 1] for valid pixels
with rasterio.open(str(OUTPUT_TIF)) as out_src:
    prob_band = out_src.read(1)
    valid_probs = prob_band[prob_band != -9999.0]
    in_range = np.all((valid_probs >= 0.0) & (valid_probs <= 1.0))
    check(in_range, f"10. Valid probability values remain strictly in continuous range [0, 1] (min={valid_probs.min():.5f}, max={valid_probs.max():.5f})")

# 11. Metadata JSON is created
check(OUTPUT_JSON.exists() and OUTPUT_JSON.stat().st_size > 0, "11. Metadata JSON sidecar is created on disk")

# 12. Metadata JSON can be parsed using Python's standard JSON parser
try:
    with open(OUTPUT_JSON, "r", encoding="utf-8") as f:
        meta = json.load(f)
    check(True, "12. Metadata JSON is parsed cleanly with standard Python json.load()")
except Exception as e:
    check(False, f"12. JSON parse failed: {e}")

# 13. minProbability is a native JSON number
min_prob = meta.get("minProbability")
check(isinstance(min_prob, float) and type(min_prob) is float, f"13. minProbability is a native JSON float: {min_prob} (type: {type(min_prob).__name__})")

# 14. maxProbability is a native JSON number
max_prob = meta.get("maxProbability")
check(isinstance(max_prob, float) and type(max_prob) is float, f"14. maxProbability is a native JSON float: {max_prob} (type: {type(max_prob).__name__})")

# 15. CRS is preserved
with rasterio.open(str(INPUT_TIF)) as in_src, rasterio.open(str(OUTPUT_TIF)) as out_src:
    check(in_src.crs == out_src.crs and meta.get("crs") == in_src.crs.to_string(), f"15. Spatial CRS preserved: {out_src.crs}")

# 16. Bounds are preserved
with rasterio.open(str(INPUT_TIF)) as in_src, rasterio.open(str(OUTPUT_TIF)) as out_src:
    check(in_src.bounds == out_src.bounds, f"16. Spatial bounds preserved: {out_src.bounds}")

# 17. Transform is preserved
with rasterio.open(str(INPUT_TIF)) as in_src, rasterio.open(str(OUTPUT_TIF)) as out_src:
    check(in_src.transform == out_src.transform, f"17. Affine transform preserved: {out_src.transform}")

# 18. Resolution metadata follows the existing policy
res_meta = meta.get("resolution")
with rasterio.open(str(INPUT_TIF)) as in_src:
    check(isinstance(res_meta, list) and len(res_meta) == 2 and np.isclose(res_meta[0], in_src.res[0]), f"18. Resolution metadata preserved per policy: {res_meta}")

# 19. No unexpected risk categories or thresholds are introduced
forbidden_keys = {"riskScore", "riskLevel", "riskCategory", "threshold", "classification", "highRisk", "lowRisk"}
found_forbidden = [k for k in meta.keys() if k in forbidden_keys]
check(len(found_forbidden) == 0, f"19. No risk categories or thresholds introduced (only continuous probabilities)")

print("=" * 60)
print(f"TOTAL VERIFICATIONS PASSED: {tests_passed} / {tests_total}")
print("=" * 60)

# Cleanup
try:
    INPUT_TIF.unlink(missing_ok=True)
    OUTPUT_TIF.unlink(missing_ok=True)
    OUTPUT_JSON.unlink(missing_ok=True)
    SCRATCH_DIR.rmdir()
except Exception:
    pass

if tests_passed == tests_total:
    print("\n🎉 ALL 19 ML PIPELINE CONTRACT CHECKS PASSED PERFECTLY!\n")
    sys.exit(0)
else:
    sys.exit(1)
