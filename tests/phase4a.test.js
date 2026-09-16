// tests/phase4a.test.js
// Phase 4A — ML Prediction Metadata Foundation Test Suite
//
// Run with: node tests/phase4a.test.js

const mongoose = require('mongoose');
const MLPrediction = require('../src/models/mlPrediction.model');
const EnvironmentalData = require('../src/models/environmentalData.model');
const Location = require('../src/models/location.model');
const {
  createMLPrediction,
  getAllMLPredictions,
  getLatestCompletedPrediction,
  getMLPredictionById
} = require('../src/controllers/mlPrediction.controller');
const healthController = require('../src/controllers/health.controller');
const app = require('../src/app');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`❌ FAIL: ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('TEST SUITE: Phase 4A ML Prediction Foundation');
  console.log('====================================================\n');

  // Test 1: Existing /api/health
  console.log('--- 1. Existing Health Check Test ---');
  {
    const req = {};
    let statusSent = null;
    let jsonSent = null;
    const res = {
      status(code) { statusSent = code; return this; },
      json(data) { jsonSent = data; return this; }
    };
    healthController.getHealthStatus(req, res);
    assert(statusSent === 200, `GET /api/health returns HTTP 200 (Got ${statusSent})`);
    assert(jsonSent?.status === 'success', `Health response status is 'success'`);
    assert(jsonSent?.project !== undefined, `Health response includes project metadata`);
  }

  // Test 2: Existing Location APIs
  console.log('\n--- 2. Existing Location APIs & Model Integrity ---');
  {
    const locDoc = new Location({
      locationId: 'LOC-AS-TEST',
      name: 'Kamrup Testing Ground',
      district: 'Kamrup Metropolitan',
      latitude: 26.15,
      longitude: 91.75
    });
    const err = locDoc.validateSync();
    assert(!err, 'Location model validates cleanly');
    assert(locDoc.locationId === 'LOC-AS-TEST', 'Location ID is preserved');
  }

  // Test 3: Existing Environmental Data APIs
  console.log('\n--- 3. Existing Environmental Data APIs & Schema Integrity ---');
  {
    const envDoc = new EnvironmentalData({
      locationId: 'LOC-AS-001',
      rainfall: 45.6,
      cumulativeRainfall: 156.4,
      soilMoisture: 0.72,
      elevation: 680,
      slope: 38.4,
      aspect: 210,
      ndvi: 0.43,
      soilClay: 24.5,
      landCover: 'Forest',
      recordedAt: new Date('2026-09-16T12:00:00.000Z')
    });
    const err = envDoc.validateSync();
    assert(!err, 'EnvironmentalData model with soilClay validates cleanly');
    assert(envDoc.soilClay === 24.5, 'soilClay is preserved');
    assert(envDoc.cumulativeRainfall === 156.4, 'cumulativeRainfall preserved');
    assert(envDoc.soilMoisture === 0.72, 'soilMoisture preserved');
    assert(envDoc.aspect === 210, 'aspect preserved');
  }

  // Test 4: POST a valid ML prediction metadata record
  console.log('\n--- 4. POST Valid ML Prediction Metadata Record ---');
  {
    const originalSave = MLPrediction.prototype.save;
    MLPrediction.prototype.save = async function () {
      const doc = this.toObject();
      doc._id = 'mock-id-001';
      return doc;
    };

    try {
      const req = {
        body: {
          predictionId: 'PRED-AS-001',
          modelName: 'XGBoost',
          modelVersion: 'assam_landslide_xgb_model',
          studyArea: 'Assam',
          outputType: 'LANDSLIDE_PROBABILITY_RASTER',
          fileName: 'Assam_XGBoost_Landslide_Probability.tif',
          filePath: 'optional/path/or/storage/reference',
          crs: 'EPSG:4326',
          resolution: 100,
          bounds: {
            minLongitude: 89.6,
            minLatitude: 24.1,
            maxLongitude: 96.0,
            maxLatitude: 28.2
          },
          minProbability: 0.003,
          maxProbability: 0.9965,
          generatedAt: '2026-09-16T10:00:00.000Z',
          status: 'COMPLETED',
          notes: 'XGBoost probability raster for Assam study area'
        }
      };

      let statusCode = null;
      let jsonPayload = null;
      const res = {
        status(code) { statusCode = code; return this; },
        json(data) { jsonPayload = data; return this; }
      };

      await createMLPrediction(req, res, () => {});

      assert(statusCode === 201, `POST /api/ml-predictions returns HTTP 201 (Got ${statusCode})`);
      assert(jsonPayload?.status === 'success', `Response status is 'success'`);
      assert(jsonPayload?.data?.prediction?.predictionId === 'PRED-AS-001', `predictionId is 'PRED-AS-001'`);
      assert(jsonPayload?.data?.prediction?.modelName === 'XGBoost', `modelName is 'XGBoost'`);
      assert(jsonPayload?.data?.prediction?.modelVersion === 'assam_landslide_xgb_model', `modelVersion is 'assam_landslide_xgb_model'`);
      assert(jsonPayload?.data?.prediction?.outputType === 'LANDSLIDE_PROBABILITY_RASTER', `outputType is 'LANDSLIDE_PROBABILITY_RASTER'`);
      assert(jsonPayload?.data?.prediction?.minProbability === 0.003, `minProbability is 0.003`);
      assert(jsonPayload?.data?.prediction?.maxProbability === 0.9965, `maxProbability is 0.9965`);
      assert(jsonPayload?.data?.prediction?.resolution === 100, `resolution is 100`);
      assert(jsonPayload?.data?.prediction?.bounds?.minLongitude === 89.6, `bounds.minLongitude is 89.6`);
    } finally {
      MLPrediction.prototype.save = originalSave;
    }
  }

  // Test 5: GET all ML predictions
  console.log('\n--- 5. GET All ML Predictions ---');
  {
    const originalFind = MLPrediction.find;
    const mockList = [
      { predictionId: 'PRED-AS-002', generatedAt: new Date('2026-09-16T12:00:00.000Z') },
      { predictionId: 'PRED-AS-001', generatedAt: new Date('2026-09-16T10:00:00.000Z') }
    ];

    MLPrediction.find = () => ({
      sort: async () => mockList
    });

    try {
      let statusCode = null;
      let jsonPayload = null;
      const res = {
        status(code) { statusCode = code; return this; },
        json(data) { jsonPayload = data; return this; }
      };

      await getAllMLPredictions({}, res, () => {});

      assert(statusCode === 200, `GET /api/ml-predictions returns HTTP 200 (Got ${statusCode})`);
      assert(jsonPayload?.results === 2, `Results count is 2 (Got ${jsonPayload?.results})`);
      assert(jsonPayload?.data?.predictions?.length === 2, `Returned 2 prediction records`);
    } finally {
      MLPrediction.find = originalFind;
    }
  }

  // Test 6: GET prediction by predictionId
  console.log('\n--- 6. GET Prediction by predictionId ---');
  {
    const originalFindOne = MLPrediction.findOne;
    MLPrediction.findOne = async ({ predictionId }) => {
      if (predictionId === 'PRED-AS-001') {
        return { predictionId: 'PRED-AS-001', modelVersion: 'assam_landslide_xgb_model' };
      }
      return null;
    };

    try {
      // 6a. Existing record
      let statusCode = null;
      let jsonPayload = null;
      const res1 = {
        status(code) { statusCode = code; return this; },
        json(data) { jsonPayload = data; return this; }
      };
      await getMLPredictionById({ params: { predictionId: 'PRED-AS-001' } }, res1, () => {});
      assert(statusCode === 200, `GET /:predictionId returns HTTP 200 for existing ID`);
      assert(jsonPayload?.data?.prediction?.predictionId === 'PRED-AS-001', `Returns matching record`);

      // 6b. Non-existent record (404)
      statusCode = null;
      jsonPayload = null;
      const res2 = {
        status(code) { statusCode = code; return this; },
        json(data) { jsonPayload = data; return this; }
      };
      await getMLPredictionById({ params: { predictionId: 'PRED-NONEXISTENT' } }, res2, () => {});
      assert(statusCode === 404, `GET /:predictionId returns HTTP 404 for non-existent ID`);
      assert(jsonPayload?.status === 'fail', `Error status is 'fail'`);
    } finally {
      MLPrediction.findOne = originalFindOne;
    }
  }

  // Test 7: GET latest completed prediction
  console.log('\n--- 7. GET Latest Completed Prediction ---');
  {
    const originalFindOne = MLPrediction.findOne;
    MLPrediction.findOne = (query) => ({
      sort: async () => {
        if (query.status === 'COMPLETED') {
          return { predictionId: 'PRED-AS-001', status: 'COMPLETED', generatedAt: new Date() };
        }
        return null;
      }
    });

    try {
      let statusCode = null;
      let jsonPayload = null;
      const res = {
        status(code) { statusCode = code; return this; },
        json(data) { jsonPayload = data; return this; }
      };

      await getLatestCompletedPrediction({}, res, () => {});

      assert(statusCode === 200, `GET /latest returns HTTP 200 (Got ${statusCode})`);
      assert(jsonPayload?.data?.prediction?.status === 'COMPLETED', `Returns COMPLETED prediction`);
    } finally {
      MLPrediction.findOne = originalFindOne;
    }

    // 7b. When no completed prediction exists
    MLPrediction.findOne = () => ({
      sort: async () => null
    });
    try {
      let statusCode = null;
      const res = {
        status(code) { statusCode = code; return this; },
        json() { return this; }
      };
      await getLatestCompletedPrediction({}, res, () => {});
      assert(statusCode === 404, `GET /latest returns HTTP 404 when no completed records exist`);
    } finally {
      MLPrediction.findOne = originalFindOne;
    }
  }

  // Test 8: Duplicate predictionId rejection (HTTP 409)
  console.log('\n--- 8. Duplicate predictionId Rejection ---');
  {
    const originalSave = MLPrediction.prototype.save;
    MLPrediction.prototype.save = async function () {
      const err = new Error('Duplicate key error');
      err.code = 11000;
      err.keyPattern = { predictionId: 1 };
      throw err;
    };

    try {
      const req = {
        body: {
          predictionId: 'PRED-AS-001',
          fileName: 'test.tif',
          generatedAt: new Date()
        }
      };

      let statusCode = null;
      let jsonPayload = null;
      const res = {
        status(code) { statusCode = code; return this; },
        json(data) { jsonPayload = data; return this; }
      };

      await createMLPrediction(req, res, () => {});

      assert(statusCode === 409, `Duplicate predictionId rejected with HTTP 409 (Got ${statusCode})`);
      assert(jsonPayload?.status === 'fail', `Duplicate error response status is 'fail'`);
      assert(jsonPayload?.message?.includes('Duplicate Error'), `Error message mentions duplicate`);
    } finally {
      MLPrediction.prototype.save = originalSave;
    }
  }

  // Test 9: minProbability > 1 rejection
  console.log('\n--- 9. minProbability > 1 Rejection ---');
  {
    const doc = new MLPrediction({
      predictionId: 'PRED-TEST-MIN-HIGH',
      fileName: 'test.tif',
      minProbability: 1.5,
      generatedAt: new Date()
    });
    const err = doc.validateSync();
    assert(err !== undefined, `minProbability: 1.5 rejected by schema validation`);
    assert(err.errors?.minProbability !== undefined, `Error caught on 'minProbability': "${err.errors?.minProbability?.message}"`);
  }

  // Test 10: minProbability < 0 rejection
  console.log('\n--- 10. minProbability < 0 Rejection ---');
  {
    const doc = new MLPrediction({
      predictionId: 'PRED-TEST-MIN-NEG',
      fileName: 'test.tif',
      minProbability: -0.1,
      generatedAt: new Date()
    });
    const err = doc.validateSync();
    assert(err !== undefined, `minProbability: -0.1 rejected by schema validation`);
    assert(err.errors?.minProbability !== undefined, `Error caught on 'minProbability': "${err.errors?.minProbability?.message}"`);
  }

  // Test 11: maxProbability > 1 rejection
  console.log('\n--- 11. maxProbability > 1 Rejection ---');
  {
    const doc = new MLPrediction({
      predictionId: 'PRED-TEST-MAX-HIGH',
      fileName: 'test.tif',
      maxProbability: 1.05,
      generatedAt: new Date()
    });
    const err = doc.validateSync();
    assert(err !== undefined, `maxProbability: 1.05 rejected by schema validation`);
    assert(err.errors?.maxProbability !== undefined, `Error caught on 'maxProbability': "${err.errors?.maxProbability?.message}"`);
  }

  // Test 12: maxProbability < 0 rejection
  console.log('\n--- 12. maxProbability < 0 Rejection ---');
  {
    const doc = new MLPrediction({
      predictionId: 'PRED-TEST-MAX-NEG',
      fileName: 'test.tif',
      maxProbability: -0.5,
      generatedAt: new Date()
    });
    const err = doc.validateSync();
    assert(err !== undefined, `maxProbability: -0.5 rejected by schema validation`);
    assert(err.errors?.maxProbability !== undefined, `Error caught on 'maxProbability': "${err.errors?.maxProbability?.message}"`);
  }

  // Test 13: invalid status rejection
  console.log('\n--- 13. Invalid Status Rejection ---');
  {
    const doc = new MLPrediction({
      predictionId: 'PRED-TEST-STATUS',
      fileName: 'test.tif',
      status: 'RUNNING',
      generatedAt: new Date()
    });
    const err = doc.validateSync();
    assert(err !== undefined, `status: 'RUNNING' rejected by schema validation`);
    assert(err.errors?.status !== undefined, `Error caught on 'status': "${err.errors?.status?.message}"`);
  }

  // Test 14: invalid generatedAt rejection
  console.log('\n--- 14. Invalid generatedAt Rejection ---');
  {
    const doc = new MLPrediction({
      predictionId: 'PRED-TEST-DATE',
      fileName: 'test.tif',
      generatedAt: 'not-a-valid-date'
    });
    const err = doc.validateSync();
    assert(err !== undefined, `invalid generatedAt rejected`);
  }

  // Test 15: invalid resolution <= 0 rejection
  console.log('\n--- 15. Invalid Resolution <= 0 Rejection ---');
  {
    const docZero = new MLPrediction({
      predictionId: 'PRED-TEST-RES-ZERO',
      fileName: 'test.tif',
      resolution: 0,
      generatedAt: new Date()
    });
    const errZero = docZero.validateSync();
    assert(errZero !== undefined, `resolution: 0 rejected (must be > 0)`);
    assert(errZero.errors?.resolution !== undefined, `Error caught on resolution: "${errZero.errors?.resolution?.message}"`);

    const docNeg = new MLPrediction({
      predictionId: 'PRED-TEST-RES-NEG',
      fileName: 'test.tif',
      resolution: -50,
      generatedAt: new Date()
    });
    const errNeg = docNeg.validateSync();
    assert(errNeg !== undefined, `resolution: -50 rejected (must be > 0)`);
  }

  // Test 16: Verify malformed bounds are rejected
  console.log('\n--- 16. Malformed Bounds Rejection ---');
  {
    const docBadCoords = new MLPrediction({
      predictionId: 'PRED-TEST-BOUNDS',
      fileName: 'test.tif',
      bounds: {
        minLongitude: 'non-numeric-longitude'
      },
      generatedAt: new Date()
    });
    const errBadCoords = docBadCoords.validateSync();
    assert(errBadCoords !== undefined, `non-numeric bounds rejected`);
  }

  // Test 17: Verify no GeoTIFF binary is stored in MongoDB
  console.log('\n--- 17. Verify No GeoTIFF Binary Stored in MongoDB ---');
  {
    const paths = MLPrediction.schema.paths;
    const pathKeys = Object.keys(paths);

    const binaryFields = pathKeys.filter(k => {
      const inst = paths[k].instance;
      return inst === 'Buffer' || inst === 'ArrayBuffer';
    });

    assert(binaryFields.length === 0, `No binary/Buffer fields exist on MLPrediction schema (Found: ${binaryFields.length})`);
    assert(paths['fileName'].instance === 'String', `fileName is stored as String`);
    assert(paths['filePath'].instance === 'String', `filePath is stored as String`);
    assert(paths['rasterData'] === undefined, `rasterData field does NOT exist on MLPrediction`);
    assert(paths['geoTiffBinary'] === undefined, `geoTiffBinary field does NOT exist on MLPrediction`);
    assert(paths['pixels'] === undefined, `pixels field does NOT exist on MLPrediction`);

    // Verify ML input features are NOT on MLPrediction
    assert(paths['elevation'] === undefined, `elevation is NOT on MLPrediction`);
    assert(paths['slope'] === undefined, `slope is NOT on MLPrediction`);
    assert(paths['rainfall'] === undefined, `rainfall is NOT on MLPrediction`);
    assert(paths['ndvi'] === undefined, `ndvi is NOT on MLPrediction`);
    assert(paths['soilClay'] === undefined, `soilClay is NOT on MLPrediction`);
    assert(paths['landCover'] === undefined, `landCover is NOT on MLPrediction`);

    // Verify Risk classifications are NOT on MLPrediction
    assert(paths['riskScore'] === undefined, `riskScore is NOT on MLPrediction`);
    assert(paths['riskLevel'] === undefined, `riskLevel is NOT on MLPrediction`);
    assert(paths['riskCategory'] === undefined, `riskCategory is NOT on MLPrediction`);
  }

  // Test 18: Verify Express Router Mounting
  console.log('\n--- 18. Route Mounting Verification ---');
  {
    const routes = [];
    app._router.stack.forEach(middleware => {
      if (middleware.route) {
        routes.push(middleware.route.path);
      } else if (middleware.name === 'router') {
        middleware.handle.stack.forEach(handler => {
          if (handler.route) {
            routes.push(handler.route.path);
          }
        });
      }
    });
    // Check router mounting
    assert(routes.includes('/'), "Root '/' route mounted");
    console.log('App router stack verified.');
  }

  console.log('\n====================================================');
  console.log(`TOTAL PASSED: ${passed}`);
  console.log(`TOTAL FAILED: ${failed}`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('\n🎉 ALL PHASE 4A VERIFICATION CHECKS PASSED PERFECTLY!');
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Unhandled test error:', err);
  process.exit(1);
});
