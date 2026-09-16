# AI-Based Early Warning and Landslide Risk Monitoring System in NER
> **Pilot Region:** Assam, Northeast India  
> **Backend Development:** Rohit + Saniya  
> **Current Milestone:** Phase 4C — ML Inference Orchestration

---

## 📌 Project Overview
This repository houses the backend service for the **AI-Based Early Warning and Landslide Risk Monitoring System in NER** focusing on the pilot region of Assam.

* **Phase 1:** Clean Node.js + Express backend foundation, error middleware, health check.
* **Phase 2:** MongoDB + Mongoose database layer and Location registry for Assam.
* **Phase 3:** Environmental and terrain data storage, validation, and retrieval tied to monitoring locations, establishing the historical and real-time data layer for upcoming ML risk models.
* **Phase 4A:** Machine Learning Prediction Foundation — Mongoose metadata schema, validation, indexing, and REST APIs for tracking ML prediction runs and output raster references without storing raster binaries in MongoDB.
* **Phase 4B:** Standalone Python inference pipeline (`ml_inference/predict.py`) — accepts a 6-band GeoTIFF, runs XGBoost `predict_proba`, and emits a probability raster + metadata JSON.
* **Phase 4C:** Backend ↔ Python orchestration — `POST /api/ml-predictions/run` spawns the inference pipeline asynchronously, creates a `PROCESSING` record immediately, and updates to `COMPLETED`/`FAILED` on exit.

---

## 📂 Project Architecture

```text
Backend/
├── .env                              # Local environment configuration (ignored by git)
├── .env.example                      # Sample environment variables template
├── .gitignore                        # Git exclusion rules
├── package.json                      # Dependencies (express, cors, dotenv, mongoose)
├── package-lock.json                 # Lockfile for dependency tree
├── README.md                         # Project documentation and guide
├── ml_inference/                     # Standalone Python inference pipeline (Phase 4B)
│   ├── predict.py                    # CLI inference script: 6-band GeoTIFF → probability raster + JSON
│   ├── requirements.txt              # Python dependencies (rasterio, xgboost, numpy)
│   ├── Dockerfile                    # Container image for Python inference environment
│   ├── README.md                     # ML pipeline documentation
│   ├── assam_landslide_xgb_model.json# Trained XGBoost model artifact (6-feature contract)
│   ├── inputs/                       # ⚠️ Place input GeoTIFFs here (server-side only, not client-writable)
│   └── outputs/                      # Generated probability rasters and metadata JSONs
└── src/
    ├── app.js                        # Express app configuration, CORS, parsers, and route mounting
    ├── server.js                     # HTTP server entrypoint, DB initialization & graceful shutdown
    ├── config/
    │   ├── db.js                     # Centralized MongoDB connection logic with fast-fail
    │   └── env.js                    # Centralized environment variable loader and defaults
    ├── controllers/
    │   ├── environmentalData.controller.js  # Environmental data handler
    │   ├── health.controller.js             # Health check controller
    │   ├── location.controller.js           # Location CRUD controller
    │   ├── mlPrediction.controller.js       # ML prediction metadata CRUD (Phase 4A)
    │   └── mlPredictionRun.controller.js    # ML inference trigger: POST /run (Phase 4C)
    ├── middleware/
    │   ├── errorHandler.js           # Centralized global error handling middleware
    │   └── notFound.js               # 404 Not Found fallback handler
    ├── models/
    │   ├── environmentalData.model.js# Environmental & terrain data Mongoose schema & validation
    │   ├── location.model.js         # Location Mongoose schema & validations
    │   └── mlPrediction.model.js     # ML prediction metadata Mongoose schema & validations
    ├── routes/
    │   ├── environmentalData.routes.js # Environmental data router (/api/environmental-data)
    │   ├── health.routes.js          # Health check router (/api/health)
    │   ├── index.js                  # Primary API route aggregator (/api)
    │   ├── location.routes.js        # Location router (/api/locations)
    │   └── mlPrediction.routes.js    # ML prediction router (/api/ml-predictions) — includes /run
    ├── services/
    │   └── mlInference.service.js    # Orchestration: validate → spawn Python → update DB (Phase 4C)
    └── tests/
        └── phase4c.test.js           # Phase 4C unit & integration tests (34 tests)
```

---

## ⚙️ Prerequisites
- **Node.js**: v18.x or higher (Tested on Node v24)
- **npm**: v9.x or higher
- **MongoDB**: v6.x or higher (Local Community Edition or MongoDB Atlas cloud cluster)

---

## 🛠️ Database Setup (MongoDB)

You can use either a **Local MongoDB instance** or **MongoDB Atlas** (cloud):

### Option A: MongoDB Atlas (Recommended for cloud/shared dev)
1. Create a free cluster at [mongodb.com/atlas](https://www.mongodb.com/atlas).
2. Under **Network Access**, add your current IP address (or `0.0.0.0/0` for development).
3. Under **Database Access**, create a database user and password.
4. Obtain your connection string:
   ```text
   mongodb+srv://<username>:<password>@cluster0.mongodb.net/landslide_monitoring?retryWrites=true&w=majority
   ```
5. Set `MONGODB_URI` in your `.env` file to this connection string.

### Option B: Local MongoDB
1. Ensure the MongoDB service is running:
   - **Windows (Service)**: Run `net start MongoDB` or start the MongoDB service from `services.msc`.
   - **Docker**: Run `docker run -d -p 27017:27017 --name mongo-landslide mongo:latest`
2. Default connection string: `mongodb://127.0.0.1:27017/landslide_monitoring`.

---

## 🚀 Getting Started

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment variables
Verify `.env` has your database URI configured:
```env
# Server Configuration
PORT=5000
NODE_ENV=development

# Database Configuration
MONGODB_URI=mongodb://127.0.0.1:27017/landslide_monitoring

# CORS Configuration
CLIENT_URL=http://localhost:3000
```

### 3. Run the development server
```bash
npm run dev
```

### 4. Run in production mode
```bash
npm start
```

---

## 📊 Environmental Data Foundation (Phase 3)

### Data Model (`EnvironmentalData`)
Stores multi-parameter meteorological and terrain metrics for a given monitoring location in Assam:

| Field | Type | Validation Rules | Description |
| :--- | :--- | :--- | :--- |
| `locationId` | `String` | Required, trimmed, uppercase | Foreign key referencing registered `Location` |
| `rainfall` | `Number` | $\ge 0$ | Current rainfall (mm) |
| `cumulativeRainfall` | `Number` | $\ge 0$ | Cumulative rainfall (mm, e.g. 24h / 72h) |
| `soilMoisture` | `Number` | $0 \le \text{val} \le 100$ | Soil moisture ratio ($0.0 - 1.0$) or percentage ($0 - 100\%$) |
| `elevation` | `Number` | $\ge 0$ | Terrain elevation in meters above sea level |
| `slope` | `Number` | $0^\circ \le \text{val} \le 90^\circ$ | Slope steepness in degrees |
| `aspect` | `Number` | $0^\circ \le \text{val} \le 360^\circ$ | Slope aspect direction in degrees |
| `ndvi` | `Number` | $-1.0 \le \text{val} \le 1.0$ | Normalized Difference Vegetation Index |
| `soilClay` | `Number` | $\ge 0$, optional (default `null`) | Soil clay content percentage |
| `landCover` | `String` | Trimmed string | Land cover type (e.g. `"Forest"`, `"Agricultural"`, `"Barren"`) |
| `recordedAt` | `Date` | Required, valid Date | Timestamp when reading was captured |
| `createdAt` / `updatedAt`| `Date` | Automatic timestamps | Document persistence timestamps |

### 🤖 ML Feature Alignment (XGBoost)
`soilClay` is stored as an environmental feature because it is one of the six current XGBoost model input features.

**CURRENT XGBOOST FEATURES:**
* `elevation`
* `slope`
* `rainfall`
* `ndvi`
* `soilClay`
* `landCover`

**ADDITIONAL ENVIRONMENTAL FIELDS:**
* `cumulativeRainfall`
* `soilMoisture`
* `aspect`

*(These additional fields are preserved as valuable environmental telemetry for dashboard visualization and future model versions).*

### Relationship with Location
- Before persisting any environmental record, the backend verifies that `locationId` exists in the `Location` collection.
- If the location does not exist, the API returns **`404 Not Found`**, strictly preventing orphan data.

---

## 🌐 Environmental Data Endpoints

All environmental endpoints are prefixed with `/api/environmental-data`.

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/environmental-data` | Record environmental metrics for an existing location |
| `GET` | `/api/environmental-data/:locationId` | Retrieve all historical records for a location (sorted newest first) |
| `GET` | `/api/environmental-data/:locationId/latest` | Retrieve the single latest environmental record for a location |

---

### 1. Record Environmental Data (`POST /api/environmental-data`)

#### Request Body
```json
{
  "locationId": "LOC-AS-001",
  "rainfall": 45.6,
  "cumulativeRainfall": 156.4,
  "soilMoisture": 0.72,
  "elevation": 680,
  "slope": 38.4,
  "aspect": 210,
  "ndvi": 0.43,
  "soilClay": 24.5,
  "landCover": "Forest",
  "recordedAt": "2026-09-10T12:00:00.000Z"
}
```

#### Success Response (`201 Created`)
```json
{
  "status": "success",
  "message": "Environmental data recorded successfully.",
  "data": {
    "environmentalData": {
      "locationId": "LOC-AS-001",
      "rainfall": 45.6,
      "cumulativeRainfall": 156.4,
      "soilMoisture": 0.72,
      "elevation": 680,
      "slope": 38.4,
      "aspect": 210,
      "ndvi": 0.43,
      "soilClay": 24.5,
      "landCover": "Forest",
      "recordedAt": "2026-09-10T12:00:00.000Z",
      "_id": "6aa2f97c46491f3687d81a15",
      "createdAt": "2026-09-10T18:39:56.059Z",
      "updatedAt": "2026-09-10T18:39:56.059Z",
      "id": "6aa2f97c46491f3687d81a15"
    }
  }
}
```

#### Nonexistent Location Error (`404 Not Found`)
```json
{
  "status": "fail",
  "message": "Location 'LOC-DOES-NOT-EXIST' not found. Cannot associate environmental data with a non-existent location."
}
```

#### Validation Failure (`400 Bad Request`)
```json
{
  "status": "fail",
  "message": "Validation failed: Invalid environmental data provided.",
  "errors": [
    "Rainfall cannot be negative",
    "Slope must be between 0 and 90 degrees",
    "NDVI must be between -1 and 1"
  ]
}
```

---

### 2. Get Environmental Data by Location (`GET /api/environmental-data/:locationId`)

#### Request
`GET /api/environmental-data/LOC-AS-001`

#### Success Response (`200 OK`)
```json
{
  "status": "success",
  "locationId": "LOC-AS-001",
  "results": 1,
  "data": {
    "records": [
      {
        "_id": "6aa2f97c46491f3687d81a15",
        "locationId": "LOC-AS-001",
        "rainfall": 45.6,
        "cumulativeRainfall": 156.4,
        "soilMoisture": 0.72,
        "elevation": 680,
        "slope": 38.4,
        "aspect": 210,
        "ndvi": 0.43,
        "soilClay": 24.5,
        "landCover": "Forest",
        "recordedAt": "2026-09-10T12:00:00.000Z",
        "createdAt": "2026-09-10T18:39:56.059Z",
        "updatedAt": "2026-09-10T18:39:56.059Z",
        "id": "6aa2f97c46491f3687d81a15"
      }
    ]
  }
}
```

---

### 3. Get Latest Environmental Data (`GET /api/environmental-data/:locationId/latest`)

#### Request
`GET /api/environmental-data/LOC-AS-001/latest`

#### Success Response (`200 OK`)
```json
{
  "status": "success",
  "locationId": "LOC-AS-001",
  "data": {
    "environmentalData": {
      "locationId": "LOC-AS-001",
      "rainfall": 45.6,
      "cumulativeRainfall": 156.4,
      "soilMoisture": 0.72,
      "elevation": 680,
      "slope": 38.4,
      "aspect": 210,
      "ndvi": 0.43,
      "soilClay": 24.5,
      "landCover": "Forest",
      "recordedAt": "2026-09-10T12:00:00.000Z"
    }
  }
}
```

---

## 📍 Location Endpoints (Phase 2)

Prefix: `/api/locations`

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/locations` | Register a new monitoring location in Assam |
| `GET` | `/api/locations` | Retrieve all registered locations (supports `?district=...`) |
| `GET` | `/api/locations/:locationId` | Retrieve details for a specific location |

---

## 🩺 System Health Check API

`GET /api/health` reports live uptime, environment, and current database connectivity status:

```json
{
  "status": "success",
  "message": "Backend is active and running successfully.",
  "project": "AI-Based Early Warning and Landslide Risk Monitoring System in NER",
  "pilotRegion": "Assam, Northeast India",
  "environment": "development",
  "database": "connected",
  "uptime": "42s",
  "timestamp": "2026-09-10T18:15:00.000Z"
}
```

---

---

## 🔮 Machine Learning Prediction Foundation (Phase 4A)

### 📌 What `MLPrediction` Represents
The `MLPrediction` model provides the metadata persistence and audit trail for machine learning prediction runs over the study region (Assam). It tracks model provenance, output raster file references, spatial coverage metrics, execution status, and probability bounds.

> [!IMPORTANT]
> **No GeoTIFF Binary in MongoDB:** MongoDB stores only metadata and file/storage path references. The actual GeoTIFF raster binaries are NOT stored in MongoDB (no binary buffers, raster pixel matrices, or base64 blobs).

---

### 🧬 ML Model Features & Canonical Mapping
The ML team's finalized XGBoost model (`assam_landslide_xgb_model.json`) requires exactly 6 input features in the following order:

| # | Backend Canonical Name (`camelCase`) | ML / GEE Feature Name (`PascalCase` / `UPPERCASE`) | Data Source / Preprocessing Details |
| :---: | :--- | :--- | :--- |
| 1 | `elevation` | `Elevation` | Digital Elevation Model (SRTM DEM) |
| 2 | `slope` | `Slope` | Derived terrain slope steepness (degrees) |
| 3 | `rainfall` | `Rainfall` | Meteorological rainfall metrics |
| 4 | `ndvi` | `NDVI` | MODIS NDVI (raw value $\times 0.0001$ computed upstream in GEE) |
| 5 | `soilClay` | `SoilClay` | Soil clay content percentage |
| 6 | `landCover` | `LandCover` | Raw ESA WorldCover v100 categorical class code |

> [!NOTE]
> - **No Upstream Encoders:** The ML model accepts raw ESA WorldCover class codes without `LabelEncoder` or `OneHotEncoder`, and features are not scaled via `StandardScaler` or `MinMaxScaler`.
> - **Backend Transformation Rule:** The backend must NOT independently normalize, standardize, encode, or transform these six features.

#### Current XGBoost Features vs. Additional Environmental Fields:
- **Current XGBoost Model Features (6):** `elevation`, `slope`, `rainfall`, `ndvi`, `soilClay`, `landCover`
- **Additional Environmental Telemetry (3):** `cumulativeRainfall`, `soilMoisture`, `aspect` *(retained for monitoring dashboard analytics and future model versions; not passed to the 6-feature XGBoost model)*.

---

### 🎯 ML Model Output & Probability Contract
- **Primary Model Output:** Landslide Probability, representing the positive-class probability `predict_proba(...)[:, 1]`.
- **Value Range:** Raw float values strictly bounded from **`0.0` to `1.0`**.
- **Raster Output Format:** Single-band GeoTIFF, `float32`, probability values, `nodata = -9999`, LZW compression.
- **Demo Raster Filename:** `Assam_XGBoost_Landslide_Probability.tif` *(reference only; not hard-coded)*.

> [!CAUTION]
> **No Hard-Coded Risk Thresholds or Categories in Phase 4A:**
> - The backend does **NOT** compute `riskScore`, `riskLevel`, or `riskCategory`.
> - The backend does **NOT** classify into `"Low"`, `"Medium"`, `"High"`, or `"Very High"`.
> - The backend does **NOT** apply the notebook's exploratory `0.4` binary cutoff or GEE visualization bins (`<0.20`, `<0.40`, `<0.70`, `≥0.70`).
> - Phase 4A exclusively stores the raw probabilistic metadata (`minProbability`, `maxProbability` between 0 and 1).

---

### 📐 Data Model (`MLPrediction`)

| Field | Type | Validation Rules | Description |
| :--- | :--- | :--- | :--- |
| `predictionId` | `String` | Required, unique, trimmed | Unique business identifier (e.g. `"PRED-AS-001"`) |
| `modelName` | `String` | Required, default: `"XGBoost"` | Name of the ML model architecture |
| `modelVersion` | `String` | Required, default: `"assam_landslide_xgb_model"` | Identifier of model artifact |
| `studyArea` | `String` | Required, default: `"Assam"` | Geographical study area |
| `outputType` | `String` | Required, default: `"LANDSLIDE_PROBABILITY_RASTER"` | Nature of generated output artifact |
| `fileName` | `String` | Required, trimmed | Name of generated raster output file |
| `filePath` | `String` | Optional, default: `null` | Local filesystem path or remote storage URL |
| `crs` | `String` | Optional, default: `null` | Coordinate Reference System (e.g. `"EPSG:4326"`) |
| `resolution` | `Number` | Optional, must be $> 0$ | Spatial resolution in meters/degrees |
| `bounds` | `Object` | Optional sub-document | Bounding coordinates (`minLongitude`, `minLatitude`, `maxLongitude`, `maxLatitude`) |
| `minProbability`| `Number` | Optional, $0 \le \text{val} \le 1$ | Minimum computed landslide probability |
| `maxProbability`| `Number` | Optional, $0 \le \text{val} \le 1$ | Maximum computed landslide probability |
| `generatedAt` | `Date` | Required, valid Date | Timestamp when prediction run was executed |
| `status` | `String` | Enum: `["PROCESSING", "COMPLETED", "FAILED"]` | Lifecycle status of prediction run |
| `notes` | `String` | Optional, default: `null` | Operator or run notes |
| `createdAt` / `updatedAt`| `Date` | Automatic timestamps | Document audit timestamps |

---

### 🌐 ML Prediction Endpoints

All ML prediction endpoints are prefixed with `/api/ml-predictions`.

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/ml-predictions` | Create metadata record for an ML prediction run |
| `GET` | `/api/ml-predictions` | Retrieve all prediction runs (newest `generatedAt` first) |
| `GET` | `/api/ml-predictions/latest` | Retrieve the latest `COMPLETED` prediction run |
| `GET` | `/api/ml-predictions/:predictionId` | Retrieve a specific prediction run by ID |

---

#### 1. Create Prediction Metadata (`POST /api/ml-predictions`)

##### Request Body
```json
{
  "predictionId": "PRED-AS-001",
  "modelName": "XGBoost",
  "modelVersion": "assam_landslide_xgb_model",
  "studyArea": "Assam",
  "outputType": "LANDSLIDE_PROBABILITY_RASTER",
  "fileName": "Assam_XGBoost_Landslide_Probability.tif",
  "filePath": "optional/path/or/storage/reference",
  "crs": "EPSG:4326",
  "resolution": 100,
  "bounds": {
    "minLongitude": 89.6,
    "minLatitude": 24.1,
    "maxLongitude": 96.0,
    "maxLatitude": 28.2
  },
  "minProbability": 0.003,
  "maxProbability": 0.9965,
  "generatedAt": "2026-09-16T10:00:00.000Z",
  "status": "COMPLETED",
  "notes": "XGBoost probability raster for Assam study area"
}
```

##### Success Response (`201 Created`)
```json
{
  "status": "success",
  "message": "ML prediction metadata recorded successfully.",
  "data": {
    "prediction": {
      "predictionId": "PRED-AS-001",
      "modelName": "XGBoost",
      "modelVersion": "assam_landslide_xgb_model",
      "studyArea": "Assam",
      "outputType": "LANDSLIDE_PROBABILITY_RASTER",
      "fileName": "Assam_XGBoost_Landslide_Probability.tif",
      "filePath": "optional/path/or/storage/reference",
      "crs": "EPSG:4326",
      "resolution": 100,
      "bounds": {
        "minLongitude": 89.6,
        "minLatitude": 24.1,
        "maxLongitude": 96.0,
        "maxLatitude": 28.2
      },
      "minProbability": 0.003,
      "maxProbability": 0.9965,
      "generatedAt": "2026-09-16T10:00:00.000Z",
      "status": "COMPLETED",
      "notes": "XGBoost probability raster for Assam study area",
      "_id": "673752e591a45cb082d619a1",
      "createdAt": "2026-09-16T10:00:05.120Z",
      "updatedAt": "2026-09-16T10:00:05.120Z",
      "id": "673752e591a45cb082d619a1"
    }
  }
}
```

---

#### 2. Get All Predictions (`GET /api/ml-predictions`)
Returns an array of all prediction runs sorted newest `generatedAt` first.

#### 3. Get Latest Completed Prediction (`GET /api/ml-predictions/latest`)
Returns the single latest prediction run where `status: "COMPLETED"`. Returns `404 Not Found` if no completed run exists.

#### 4. Get Prediction by ID (`GET /api/ml-predictions/:predictionId`)
Returns the specific prediction metadata document. Returns `404 Not Found` if the ID does not exist.

---

---

## 🤖 Phase 4C — ML Inference Orchestration

### Endpoint: `POST /api/ml-predictions/run`

Triggers the standalone Python inference pipeline asynchronously.

**Request Body (JSON):**
```json
{
  "inputPath": "Assam_6Feature_Predictors_100m.tif"
}
```

> **Security:** `inputPath` must be a **filename or relative path only** — never an absolute path. The file is resolved server-side inside `ml_inference/inputs/`. Absolute paths, `../` traversal, null bytes, and files outside the input directory are all rejected with `HTTP 400`.

**Response `202 Accepted`:**
```json
{
  "status": "success",
  "message": "Inference started. Poll the status endpoint for updates.",
  "data": {
    "predictionId": "PRED-AS-1726493930000-a1b2c3d4",
    "status": "PROCESSING",
    "statusEndpoint": "/api/ml-predictions/PRED-AS-1726493930000-a1b2c3d4"
  }
}
```

**Error responses:**
- `400 Bad Request` — missing `inputPath`, absolute path, path traversal, null bytes, file not found
- `500 Internal Server Error` — unexpected server error

---

### Asynchronous Lifecycle

```
POST /api/ml-predictions/run
         ↓
  Validate inputPath (security checks)
         ↓
  Create MLPrediction  { status: "PROCESSING" }
         ↓
  Return 202 immediately  ← client receives predictionId here
         ↓  (background)
  spawn python predict.py --model ... --input ... --output ...
         ↓
  Python exits 0 → read <input>_probability.json
         ↓
  Map metadata → update MLPrediction  { status: "COMPLETED" }

  (or on failure → { status: "FAILED", notes: "..." })
```

**Poll for status:**
```
GET /api/ml-predictions/:predictionId
```
Returns the live document. Poll until `status` changes from `PROCESSING`.

---

### Python Inference Pipeline (Phase 4B)

Located in `ml_inference/predict.py`. Usage:
```bash
python ml_inference/predict.py \
  --model  ml_inference/assam_landslide_xgb_model.json \
  --input  ml_inference/inputs/Assam_6Feature_Predictors_100m.tif \
  --output ml_inference/outputs/Assam_6Feature_Predictors_100m_probability.tif
```

**6-Band Contract (must be in exact order):**
| Band | Feature |
|------|---------|
| 1 | Elevation |
| 2 | Slope |
| 3 | Rainfall |
| 4 | NDVI |
| 5 | SoilClay |
| 6 | LandCover |

Outputs:
- `<name>_probability.tif` — float32 single-band probability raster (NoData: `-9999`)
- `<name>_probability.json` — metadata (CRS, bounds, resolution, min/max probability)

---

### Resolution Policy

- If the output raster has **equal square pixels** in a **projected CRS** → `resolution` is stored as a scalar (metres).
- If the CRS is geographic (e.g. EPSG:4326), pixels are non-square, or the value cannot be safely represented → `resolution = null` and the original resolution is preserved in the `notes` field.
- **Geographic degrees are never approximated or converted to metres.**

---

### Configuration

All ML paths are server-side configuration — never accepted from the client:

```env
# .env (optional overrides — all have safe defaults)
ML_PYTHON_PATH=python          # Python executable
ML_INFERENCE_SCRIPT=...        # Path to predict.py (default: ml_inference/predict.py)
ML_MODEL_PATH=...              # Path to XGBoost JSON model artifact
ML_INPUT_DIR=...               # Allowed input directory (default: ml_inference/inputs)
ML_OUTPUT_DIR=...              # Output directory (default: ml_inference/outputs)
```

---

### ⚠️ ML Technical Notes
1. **Model Provenance:** `modelVersion` defaults to `"assam_landslide_xgb_model"` to reflect the actual artifact filename rather than an arbitrary semantic version.
2. **No Risk Thresholds:** Phase 4C stores raw probability values only (`minProbability`, `maxProbability`). Low/Medium/High/Very High classification is not implemented.
3. **No GEE Integration:** GEE export pipelines and cloud sync are out of scope.
4. **No File Upload:** The API accepts filenames only. Files must be placed in `ml_inference/inputs/` by an administrator.

---

---

## Phase 4D — ML GIS Result Integration

Phase 4D bridges the completed ML inference results to GIS consumers by providing:
1. Retrieval of completed prediction metadata via `GET /api/ml-predictions/:predictionId`.
2. Discovery of the latest completed prediction run via `GET /api/ml-predictions/latest`.
3. Spatial metadata ready for map consumption via `GET /api/ml-predictions/:predictionId/gis`.
4. Secure raster file streaming via `GET /api/ml-predictions/:predictionId/raster`.

### Key Design & Integrity Principles
- **Probability Semantics:**
  - Continuous float values between `0.0` and `1.0`.
  - **Probability is continuous 0–1. Risk classification thresholds are not finalized.**
  - No risk categories (`Low`, `Medium`, `High`, `Very High`) and no binary risk flags.
- **No GeoJSON Conversion of Rasters:**
  - Probability rasters remain binary GeoTIFF files on disk. The metadata endpoint exposes GIS coordinates, CRS, resolution, and output file info without generating massive GeoJSON polygon/point datasets.
- **Strict File Sandboxing & Path Traversal Prevention:**
  - `GET /:predictionId/raster` enforces that the requested file resides strictly within the approved `ML_OUTPUT_DIR`.
  - Relative traversal sequences (`../`, `..\\`), null bytes, and paths outside `ML_OUTPUT_DIR` are rejected (`400` / `403`).
  - Prediction status must be `COMPLETED`; `PROCESSING` and `FAILED` requests return `409 Conflict`.
  - Missing raster files on disk return `500 Data Integrity Error`.
- **CRS & Bounds Contract:**
  - Uses authoritative CRS and spatial bounds generated by Python inference.
  - Bounds schema preserves `minLongitude`, `minLatitude`, `maxLongitude`, `maxLatitude`.
  - No coordinates are invented or fabricated.
- **Resolution Handling:**
  - Projected CRS with equal square pixels → stored as scalar (metres).
  - Geographic CRS (degrees) or non-square pixels → stored as `null`, with raw pixel dimensions preserved in `notes`.
  - **Never approximates degrees to metres.**
- **Model Result Immutability:**
  - Completed prediction metadata is treated as generated ML output. No mutating endpoints (`PUT`, `PATCH`, `DELETE`) are exposed.

### Endpoints

#### 1. Retrieve Completed Prediction
`GET /api/ml-predictions/:predictionId`

Response (200 OK):
```json
{
  "status": "success",
  "data": {
    "prediction": {
      "predictionId": "PRED-AS-1726493930000-a1b2c3d4",
      "modelName": "XGBoost",
      "modelVersion": "assam_landslide_xgb_model",
      "studyArea": "Assam",
      "outputType": "LANDSLIDE_PROBABILITY_RASTER",
      "fileName": "Assam_6Feature_Predictors_100m_probability.tif",
      "filePath": "C:\\...\\ml_inference\\outputs\\Assam_6Feature_Predictors_100m_probability.tif",
      "crs": "EPSG:4326",
      "resolution": null,
      "bounds": {
        "minLongitude": 89.67,
        "minLatitude": 24.12,
        "maxLongitude": 96.02,
        "maxLatitude": 27.95
      },
      "minProbability": 0.0012,
      "maxProbability": 0.9854,
      "generatedAt": "2026-09-16T12:00:00.000Z",
      "status": "COMPLETED",
      "notes": "Resolution stored as null per policy — original: [0.001, 0.001]; CRS: EPSG:4326"
    }
  }
}
```

#### 2. Retrieve Latest Completed Prediction
`GET /api/ml-predictions/latest`
- Returns HTTP 200 with the single most recent prediction where `status: "COMPLETED"`.
- Never returns `PROCESSING` or `FAILED` predictions.
- Returns HTTP 404 if no completed prediction exists.

#### 3. GIS-Ready Metadata Endpoint
`GET /api/ml-predictions/:predictionId/gis`

Response (200 OK):
```json
{
  "status": "success",
  "data": {
    "predictionId": "PRED-AS-1726493930000-a1b2c3d4",
    "status": "COMPLETED",
    "outputType": "LANDSLIDE_PROBABILITY_RASTER",
    "modelName": "XGBoost",
    "modelVersion": "assam_landslide_xgb_model",
    "studyArea": "Assam",
    "crs": "EPSG:4326",
    "bounds": {
      "minLongitude": 89.67,
      "minLatitude": 24.12,
      "maxLongitude": 96.02,
      "maxLatitude": 27.95
    },
    "resolution": null,
    "fileName": "Assam_6Feature_Predictors_100m_probability.tif",
    "filePath": "C:\\...\\ml_inference\\outputs\\Assam_6Feature_Predictors_100m_probability.tif",
    "minProbability": 0.0012,
    "maxProbability": 0.9854,
    "generatedAt": "2026-09-16T12:00:00.000Z",
    "notes": "Resolution stored as null per policy — original: [0.001, 0.001]; CRS: EPSG:4326"
  }
}
```
- Returns HTTP 409 if prediction is `PROCESSING` or `FAILED`.
- Returns HTTP 404 if `predictionId` does not exist.

#### 4. Secure Raster File Access
`GET /api/ml-predictions/:predictionId/raster`

- **Headers returned:**
  - `Content-Type: image/tiff`
  - `Content-Disposition: inline; filename="<fileName>"`
- **Response status codes:**
  - `200 OK`: Binary GeoTIFF stream.
  - `404 Not Found`: Prediction does not exist.
  - `409 Conflict`: Prediction is still `PROCESSING` or has `FAILED`.
  - `403 Forbidden`: Stored file path is outside the approved `ML_OUTPUT_DIR`.
  - `500 Internal Server Error`: Stored raster file is missing from server storage (data integrity error).

---

## 📋 Project Scope & Boundaries
- ✅ Phase 1: Core Express architecture, centralized error handling, and health check
- ✅ Phase 2: Location registry with Assam boundary validations
- ✅ Phase 3: Environmental time-series data storage, physical bounds validation, and location relations
- ✅ Phase 4A: ML Prediction run metadata schema, validation, indexing, and REST APIs
- ✅ Phase 4B: Standalone Python inference pipeline (6-band GeoTIFF → probability raster)
- ✅ Phase 4C: Backend orchestration — async Python spawn, PROCESSING → COMPLETED/FAILED lifecycle
- ✅ Phase 4D: ML GIS Result Integration & Secure Raster Serving
- ❌ No Risk score categorizations (`Low`/`Medium`/`High`) or hazard classification thresholds
- ❌ No GEE automation, export pipelines, or cloud bucket sync
- ❌ No GeoTIFF binary storage in MongoDB
- ❌ No Notification/Alert dispatch engines
- ❌ No Authentication changes, GIS map rendering, or Frontend UI

