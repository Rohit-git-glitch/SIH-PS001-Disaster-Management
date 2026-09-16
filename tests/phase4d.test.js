// tests/phase4d.test.js
// Phase 4D — ML Prediction Result + GIS Data Integration Test Suite
//
// Run with: node tests/phase4d.test.js
//
// Test coverage:
//   GROUP 1: Prediction Retrieval & Lifecycle Status Gating
//     1. Existing prediction can be retrieved via GET /:predictionId
//     2. Unknown prediction returns 404
//     3. GET /latest returns latest COMPLETED prediction
//     4. PROCESSING prediction is not returned as latest usable result
//     5. FAILED prediction is not returned as latest usable result
//   GROUP 2: GIS Metadata Endpoint (GET /:predictionId/gis)
//     6. Completed prediction returns GIS metadata (HTTP 200)
//     7. GIS metadata contains predictionId
//     8. GIS metadata contains CRS
//     9. GIS metadata contains bounds (minLongitude, minLatitude, maxLongitude, maxLatitude)
//     10. GIS metadata contains probability statistics (minProbability, maxProbability)
//     11. No invented coordinates — coordinates match stored values exactly
//     12. No risk category or classification thresholds introduced
//     13. PROCESSING prediction returns 409 Conflict
//     14. FAILED prediction returns 409 Conflict
//     15. Unknown prediction ID returns 404 Not Found
//   GROUP 3: Raster Endpoint & Security (GET /:predictionId/raster)
//     16. Completed prediction with existing raster is served with Content-Type: image/tiff
//     17. Content-Disposition header includes correct filename
//     18. PROCESSING prediction cannot serve raster (returns 409)
//     19. FAILED prediction cannot serve raster (returns 409)
//     20. Unknown prediction returns 404
//     21. Missing raster file returns 500 data-integrity error
//     22. Path traversal ("../") in filePath is rejected
//     23. Path traversal ("..\\") in filePath is rejected
//     24. File outside ML output directory is rejected
//     25. Arbitrary filesystem files cannot be served
//     26. validateOutputFilePath helper rejects empty/null inputs
//     27. validateOutputFilePath helper rejects null bytes
//   GROUP 4: Resolution & Schema Policy
//     28. Safe scalar resolution is preserved for projected CRS
//     29. Unsafe resolution remains null rather than fabricated
//   GROUP 5: Model Result Immutability & Route Registration
//     30. Completed prediction results are immutable (no update/delete routes exposed)
//     31. Express routes registration contains /:predictionId/gis and /:predictionId/raster

'use strict';

const path = require('path');
const fs = require('fs');
const assert = require('assert');
const { EventEmitter } = require('events');

// Setup test environment directories
const TEST_DIR = path.join(__dirname, '__test_phase4d__');
const TEST_OUTPUT_DIR = path.join(TEST_DIR, 'outputs');
if (!fs.existsSync(TEST_OUTPUT_DIR)) {
  fs.mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
}

// Create a dummy valid GeoTIFF file for raster tests
const VALID_TIF_NAME = 'sample_probability.tif';
const VALID_TIF_PATH = path.join(TEST_OUTPUT_DIR, VALID_TIF_NAME);
const DUMMY_TIFF_BYTES = Buffer.from('II*\x00\x08\x00\x00\x00FAKE_GEOTIFF_DATA_FOR_TESTING');
fs.writeFileSync(VALID_TIF_PATH, DUMMY_TIFF_BYTES);

// Set env var for ML_OUTPUT_DIR
process.env.ML_OUTPUT_DIR = TEST_OUTPUT_DIR;

// Load controller and model
const mlPredictionGISController = require('../src/controllers/mlPredictionGIS.controller');
const mlPredictionController = require('../src/controllers/mlPrediction.controller');
const MLPrediction = require('../src/models/mlPrediction.model');
const mlPredictionRouter = require('../src/routes/mlPrediction.routes');

// Test counting harness
let passed = 0;
let failed = 0;
const results = [];

async function test(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    passed++;
  } catch (e) {
    results.push({ name, ok: false, error: e.message });
    failed++;
  }
}

// Mock Express response generator
function createMockRes() {
  const res = new EventEmitter();
  res.statusCode = 200;
  res.headers = {};
  res._body = null;
  res._dataChunks = [];

  res.status = function (code) {
    this.statusCode = code;
    return this;
  };

  res.json = function (obj) {
    this._body = obj;
    return this;
  };

  res.setHeader = function (name, value) {
    this.headers[name.toLowerCase()] = value;
  };

  res.getHeader = function (name) {
    return this.headers[name.toLowerCase()];
  };

  res.write = function (chunk) {
    this._dataChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  };

  res.end = function (chunk) {
    if (chunk) {
      this._dataChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    this.emit('finish');
  };

  return res;
}

// Mock dataset representing stored MongoDB documents
const mockDatabase = [
  {
    predictionId: 'PRED-COMPLETED-001',
    status: 'COMPLETED',
    modelName: 'XGBoost',
    modelVersion: 'assam_landslide_xgb_model',
    studyArea: 'Assam',
    outputType: 'LANDSLIDE_PROBABILITY_RASTER',
    fileName: VALID_TIF_NAME,
    filePath: VALID_TIF_PATH,
    crs: 'EPSG:4326',
    resolution: null,
    bounds: {
      minLongitude: 89.67,
      minLatitude: 24.12,
      maxLongitude: 96.02,
      maxLatitude: 27.95
    },
    minProbability: 0.0012,
    maxProbability: 0.9854,
    generatedAt: new Date('2026-09-16T12:00:00Z'),
    notes: 'Resolution stored as null per policy — original: [0.001, 0.001]; CRS: EPSG:4326'
  },
  {
    predictionId: 'PRED-PROCESSING-002',
    status: 'PROCESSING',
    modelName: 'XGBoost',
    modelVersion: 'assam_landslide_xgb_model',
    studyArea: 'Assam',
    outputType: 'LANDSLIDE_PROBABILITY_RASTER',
    fileName: 'in_progress.tif',
    filePath: null,
    crs: null,
    resolution: null,
    bounds: null,
    minProbability: null,
    maxProbability: null,
    generatedAt: new Date('2026-09-16T13:00:00Z'),
    notes: null
  },
  {
    predictionId: 'PRED-FAILED-003',
    status: 'FAILED',
    modelName: 'XGBoost',
    modelVersion: 'assam_landslide_xgb_model',
    studyArea: 'Assam',
    outputType: 'LANDSLIDE_PROBABILITY_RASTER',
    fileName: 'failed.tif',
    filePath: null,
    crs: null,
    resolution: null,
    bounds: null,
    minProbability: null,
    maxProbability: null,
    generatedAt: new Date('2026-09-16T11:00:00Z'),
    notes: 'Python process exited with code 1. Raster validation failed.'
  },
  {
    predictionId: 'PRED-MISSINGFILE-004',
    status: 'COMPLETED',
    modelName: 'XGBoost',
    modelVersion: 'assam_landslide_xgb_model',
    studyArea: 'Assam',
    outputType: 'LANDSLIDE_PROBABILITY_RASTER',
    fileName: 'ghost.tif',
    filePath: path.join(TEST_OUTPUT_DIR, 'ghost_missing_on_disk.tif'),
    crs: 'EPSG:4326',
    resolution: null,
    bounds: { minLongitude: 90, minLatitude: 25, maxLongitude: 95, maxLatitude: 27 },
    minProbability: 0.05,
    maxProbability: 0.85,
    generatedAt: new Date('2026-09-16T10:00:00Z'),
    notes: null
  },
  {
    predictionId: 'PRED-TRAVERSAL-005',
    status: 'COMPLETED',
    modelName: 'XGBoost',
    modelVersion: 'assam_landslide_xgb_model',
    studyArea: 'Assam',
    outputType: 'LANDSLIDE_PROBABILITY_RASTER',
    fileName: 'secret.txt',
    filePath: path.join(TEST_OUTPUT_DIR, '../../secret.txt'),
    crs: 'EPSG:4326',
    resolution: null,
    bounds: { minLongitude: 90, minLatitude: 25, maxLongitude: 95, maxLatitude: 27 },
    minProbability: 0.05,
    maxProbability: 0.85,
    generatedAt: new Date('2026-09-16T09:00:00Z'),
    notes: null
  },
  {
    predictionId: 'PRED-PROJECTED-006',
    status: 'COMPLETED',
    modelName: 'XGBoost',
    modelVersion: 'assam_landslide_xgb_model',
    studyArea: 'Assam',
    outputType: 'LANDSLIDE_PROBABILITY_RASTER',
    fileName: 'utm_prediction.tif',
    filePath: VALID_TIF_PATH,
    crs: 'EPSG:32646',
    resolution: 30,
    bounds: { minLongitude: 90.1, minLatitude: 25.1, maxLongitude: 94.9, maxLatitude: 26.9 },
    minProbability: 0.005,
    maxProbability: 0.95,
    generatedAt: new Date('2026-09-16T08:00:00Z'),
    notes: null
  }
];

// Stub MLPrediction.findOne
const originalFindOne = MLPrediction.findOne;
MLPrediction.findOne = function (query) {
  let matched = null;
  if (query.predictionId) {
    matched = mockDatabase.find((doc) => doc.predictionId === query.predictionId);
  } else if (query.status) {
    const list = mockDatabase
      .filter((doc) => doc.status === query.status)
      .sort((a, b) => b.generatedAt - a.generatedAt);
    matched = list[0] || null;
  }
  return {
    sort: function (sortQuery) {
      return Promise.resolve(matched);
    },
    then: function (resolve, reject) {
      return Promise.resolve(matched).then(resolve, reject);
    }
  };
};

// ===========================================================================
// RUN ALL TEST SUITES
// ===========================================================================
async function runSuite() {
  console.log('====================================================');
  console.log('TEST SUITE: Phase 4D — ML Prediction Result + GIS');
  console.log('====================================================\n');

  // -------------------------------------------------------------------------
  // GROUP 1: Prediction Retrieval & Status Gating
  // -------------------------------------------------------------------------
  await test('1. Existing prediction can be retrieved via GET /:predictionId', async () => {
    const req = { params: { predictionId: 'PRED-COMPLETED-001' } };
    const res = createMockRes();
    await mlPredictionController.getMLPredictionById(req, res, () => {});
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res._body.status, 'success');
    assert.strictEqual(res._body.data.prediction.predictionId, 'PRED-COMPLETED-001');
    assert.strictEqual(res._body.data.prediction.status, 'COMPLETED');
  });

  await test('2. Unknown prediction returns 404', async () => {
    const req = { params: { predictionId: 'PRED-DOES-NOT-EXIST' } };
    const res = createMockRes();
    await mlPredictionController.getMLPredictionById(req, res, () => {});
    assert.strictEqual(res.statusCode, 404);
    assert.strictEqual(res._body.status, 'fail');
    assert.ok(res._body.message.includes('not found'));
  });

  await test('3. GET /latest returns latest COMPLETED prediction', async () => {
    const req = {};
    const res = createMockRes();
    await mlPredictionController.getLatestCompletedPrediction(req, res, () => {});
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res._body.status, 'success');
    assert.strictEqual(res._body.data.prediction.status, 'COMPLETED');
    assert.strictEqual(res._body.data.prediction.predictionId, 'PRED-COMPLETED-001');
  });

  await test('4. PROCESSING prediction is not returned as latest usable result', async () => {
    const req = {};
    const res = createMockRes();
    await mlPredictionController.getLatestCompletedPrediction(req, res, () => {});
    assert.notStrictEqual(res._body.data.prediction.status, 'PROCESSING');
    assert.notStrictEqual(res._body.data.prediction.predictionId, 'PRED-PROCESSING-002');
  });

  await test('5. FAILED prediction is not returned as latest usable result', async () => {
    const req = {};
    const res = createMockRes();
    await mlPredictionController.getLatestCompletedPrediction(req, res, () => {});
    assert.notStrictEqual(res._body.data.prediction.status, 'FAILED');
    assert.notStrictEqual(res._body.data.prediction.predictionId, 'PRED-FAILED-003');
  });

  // -------------------------------------------------------------------------
  // GROUP 2: GIS Metadata Endpoint (GET /:predictionId/gis)
  // -------------------------------------------------------------------------
  await test('6. Completed prediction returns GIS metadata (HTTP 200)', async () => {
    const req = { params: { predictionId: 'PRED-COMPLETED-001' } };
    const res = createMockRes();
    await mlPredictionGISController.getGISMetadata(req, res, () => {});
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res._body.status, 'success');
    assert.ok(res._body.data);
  });

  await test('7. GIS metadata contains predictionId', async () => {
    const req = { params: { predictionId: 'PRED-COMPLETED-001' } };
    const res = createMockRes();
    await mlPredictionGISController.getGISMetadata(req, res, () => {});
    assert.strictEqual(res._body.data.predictionId, 'PRED-COMPLETED-001');
    assert.strictEqual(res._body.data.status, 'COMPLETED');
    assert.strictEqual(res._body.data.outputType, 'LANDSLIDE_PROBABILITY_RASTER');
  });

  await test('8. GIS metadata contains CRS', async () => {
    const req = { params: { predictionId: 'PRED-COMPLETED-001' } };
    const res = createMockRes();
    await mlPredictionGISController.getGISMetadata(req, res, () => {});
    assert.strictEqual(res._body.data.crs, 'EPSG:4326');
  });

  await test('9. GIS metadata contains bounds', async () => {
    const req = { params: { predictionId: 'PRED-COMPLETED-001' } };
    const res = createMockRes();
    await mlPredictionGISController.getGISMetadata(req, res, () => {});
    const bounds = res._body.data.bounds;
    assert.ok(bounds);
    assert.strictEqual(bounds.minLongitude, 89.67);
    assert.strictEqual(bounds.minLatitude, 24.12);
    assert.strictEqual(bounds.maxLongitude, 96.02);
    assert.strictEqual(bounds.maxLatitude, 27.95);
  });

  await test('10. GIS metadata contains probability statistics', async () => {
    const req = { params: { predictionId: 'PRED-COMPLETED-001' } };
    const res = createMockRes();
    await mlPredictionGISController.getGISMetadata(req, res, () => {});
    assert.strictEqual(res._body.data.minProbability, 0.0012);
    assert.strictEqual(res._body.data.maxProbability, 0.9854);
  });

  await test('11. No invented coordinates — coordinates match stored values exactly', async () => {
    const req = { params: { predictionId: 'PRED-COMPLETED-001' } };
    const res = createMockRes();
    await mlPredictionGISController.getGISMetadata(req, res, () => {});
    const stored = mockDatabase.find((d) => d.predictionId === 'PRED-COMPLETED-001');
    assert.deepStrictEqual(res._body.data.bounds, stored.bounds);
  });

  await test('12. No risk category or classification thresholds introduced', async () => {
    const req = { params: { predictionId: 'PRED-COMPLETED-001' } };
    const res = createMockRes();
    await mlPredictionGISController.getGISMetadata(req, res, () => {});
    const data = res._body.data;
    assert.strictEqual(data.riskCategory, undefined);
    assert.strictEqual(data.riskLevel, undefined);
    assert.strictEqual(data.riskScore, undefined);
    assert.strictEqual(data.isHighRisk, undefined);
    assert.strictEqual(data.threshold, undefined);
    // Probabilities are continuous numbers between 0 and 1
    assert.ok(data.minProbability >= 0 && data.minProbability <= 1);
    assert.ok(data.maxProbability >= 0 && data.maxProbability <= 1);
  });

  await test('13. PROCESSING prediction returns 409 Conflict on /gis endpoint', async () => {
    const req = { params: { predictionId: 'PRED-PROCESSING-002' } };
    const res = createMockRes();
    await mlPredictionGISController.getGISMetadata(req, res, () => {});
    assert.strictEqual(res.statusCode, 409);
    assert.strictEqual(res._body.status, 'fail');
    assert.ok(res._body.message.includes('still processing'));
  });

  await test('14. FAILED prediction returns 409 Conflict on /gis endpoint', async () => {
    const req = { params: { predictionId: 'PRED-FAILED-003' } };
    const res = createMockRes();
    await mlPredictionGISController.getGISMetadata(req, res, () => {});
    assert.strictEqual(res.statusCode, 409);
    assert.strictEqual(res._body.status, 'fail');
    assert.ok(res._body.message.includes('failed'));
  });

  await test('15. Unknown prediction ID returns 404 Not Found on /gis endpoint', async () => {
    const req = { params: { predictionId: 'PRED-DOES-NOT-EXIST' } };
    const res = createMockRes();
    await mlPredictionGISController.getGISMetadata(req, res, () => {});
    assert.strictEqual(res.statusCode, 404);
    assert.strictEqual(res._body.status, 'fail');
  });

  // -------------------------------------------------------------------------
  // GROUP 3: Raster Endpoint & Security (GET /:predictionId/raster)
  // -------------------------------------------------------------------------
  await test('16. Completed prediction with existing raster is served with Content-Type: image/tiff', async () => {
    const req = { params: { predictionId: 'PRED-COMPLETED-001' } };
    const res = createMockRes();

    await new Promise((resolve) => {
      res.on('finish', resolve);
      mlPredictionGISController.serveRaster(req, res, (err) => {
        if (err) assert.fail(err.message);
        resolve();
      });
    });

    assert.strictEqual(res.getHeader('content-type'), 'image/tiff');
    const fullBody = Buffer.concat(res._dataChunks);
    assert.strictEqual(fullBody.toString(), DUMMY_TIFF_BYTES.toString());
  });

  await test('17. Content-Disposition header includes correct filename', async () => {
    const req = { params: { predictionId: 'PRED-COMPLETED-001' } };
    const res = createMockRes();

    await new Promise((resolve) => {
      res.on('finish', resolve);
      mlPredictionGISController.serveRaster(req, res, () => resolve());
    });

    const disposition = res.getHeader('content-disposition');
    assert.ok(disposition.includes('inline'));
    assert.ok(disposition.includes(VALID_TIF_NAME));
  });

  await test('18. PROCESSING prediction cannot serve raster (returns 409)', async () => {
    const req = { params: { predictionId: 'PRED-PROCESSING-002' } };
    const res = createMockRes();
    await mlPredictionGISController.serveRaster(req, res, () => {});
    assert.strictEqual(res.statusCode, 409);
    assert.strictEqual(res._body.status, 'fail');
    assert.ok(res._body.message.includes('still processing'));
  });

  await test('19. FAILED prediction cannot serve raster (returns 409)', async () => {
    const req = { params: { predictionId: 'PRED-FAILED-003' } };
    const res = createMockRes();
    await mlPredictionGISController.serveRaster(req, res, () => {});
    assert.strictEqual(res.statusCode, 409);
    assert.strictEqual(res._body.status, 'fail');
    assert.ok(res._body.message.includes('failed'));
  });

  await test('20. Unknown prediction returns 404 on raster endpoint', async () => {
    const req = { params: { predictionId: 'PRED-DOES-NOT-EXIST' } };
    const res = createMockRes();
    await mlPredictionGISController.serveRaster(req, res, () => {});
    assert.strictEqual(res.statusCode, 404);
    assert.strictEqual(res._body.status, 'fail');
  });

  await test('21. Missing raster file returns 500 data-integrity error', async () => {
    const req = { params: { predictionId: 'PRED-MISSINGFILE-004' } };
    const res = createMockRes();
    await mlPredictionGISController.serveRaster(req, res, () => {});
    assert.strictEqual(res.statusCode, 500);
    assert.strictEqual(res._body.status, 'error');
    assert.ok(res._body.message.includes('Data integrity error'));
  });

  await test('22. Path traversal ("../") in filePath is rejected', async () => {
    const req = { params: { predictionId: 'PRED-TRAVERSAL-005' } };
    const res = createMockRes();
    await mlPredictionGISController.serveRaster(req, res, () => {});
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res._body.status, 'fail');
    assert.ok(res._body.message.includes('Security validation failed'));
  });

  await test('23. Path traversal ("..\\") in filePath is rejected', () => {
    assert.throws(() => {
      mlPredictionGISController.validateOutputFilePath('..\\..\\windows\\system32\\cmd.exe', TEST_OUTPUT_DIR);
    }, /Path traversal/);
  });

  await test('24. File outside ML output directory is rejected', () => {
    assert.throws(() => {
      mlPredictionGISController.validateOutputFilePath('/etc/shadow', TEST_OUTPUT_DIR);
    }, /(outside the approved|Path traversal)/);
  });

  await test('25. Arbitrary filesystem files cannot be served', () => {
    assert.throws(() => {
      mlPredictionGISController.validateOutputFilePath('C:\\Windows\\win.ini', TEST_OUTPUT_DIR);
    }, /(outside the approved|Path traversal)/);
  });

  await test('26. validateOutputFilePath helper rejects empty/null inputs', () => {
    assert.throws(() => mlPredictionGISController.validateOutputFilePath(''), /non-empty string/);
    assert.throws(() => mlPredictionGISController.validateOutputFilePath(null), /non-empty string/);
    assert.throws(() => mlPredictionGISController.validateOutputFilePath(undefined), /non-empty string/);
  });

  await test('27. validateOutputFilePath helper rejects null bytes', () => {
    assert.throws(() => {
      mlPredictionGISController.validateOutputFilePath('output.tif\0.png', TEST_OUTPUT_DIR);
    }, /Null bytes are not permitted/);
  });

  // -------------------------------------------------------------------------
  // GROUP 4: Resolution & Schema Policy
  // -------------------------------------------------------------------------
  await test('28. Safe scalar resolution is preserved for projected CRS', async () => {
    const req = { params: { predictionId: 'PRED-PROJECTED-006' } };
    const res = createMockRes();
    await mlPredictionGISController.getGISMetadata(req, res, () => {});
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res._body.data.crs, 'EPSG:32646');
    assert.strictEqual(res._body.data.resolution, 30);
  });

  await test('29. Unsafe resolution remains null rather than fabricated', async () => {
    const req = { params: { predictionId: 'PRED-COMPLETED-001' } };
    const res = createMockRes();
    await mlPredictionGISController.getGISMetadata(req, res, () => {});
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res._body.data.crs, 'EPSG:4326');
    assert.strictEqual(res._body.data.resolution, null);
    assert.ok(res._body.data.notes.includes('Resolution stored as null per policy'));
  });

  // -------------------------------------------------------------------------
  // GROUP 5: Model Result Immutability & Route Registration
  // -------------------------------------------------------------------------
  await test('30. Completed prediction results are immutable (no update/delete routes exposed)', () => {
    const routes = mlPredictionRouter.stack.map((layer) => {
      const methods = Object.keys(layer.route ? layer.route.methods : {});
      const routePath = layer.route ? layer.route.path : '';
      return { path: routePath, methods };
    });

    const mutatingMethods = ['put', 'patch', 'delete'];
    const forbiddenMutations = routes.filter((r) =>
      r.methods.some((m) => mutatingMethods.includes(m))
    );

    assert.strictEqual(
      forbiddenMutations.length,
      0,
      'No mutating HTTP methods (PUT, PATCH, DELETE) should be registered on mlPredictionRouter'
    );
  });

  await test('31. Express routes registration contains /:predictionId/gis and /:predictionId/raster', () => {
    const paths = mlPredictionRouter.stack
      .filter((layer) => layer.route)
      .map((layer) => `${Object.keys(layer.route.methods)[0].toUpperCase()} ${layer.route.path}`);

    assert.ok(paths.includes('GET /:predictionId/gis'), 'Route GET /:predictionId/gis must be registered');
    assert.ok(paths.includes('GET /:predictionId/raster'), 'Route GET /:predictionId/raster must be registered');
    assert.ok(paths.includes('GET /latest'), 'Route GET /latest must be registered');
    assert.ok(paths.includes('GET /:predictionId'), 'Route GET /:predictionId must be registered');
  });

  // Clean up test file and directory
  try {
    if (fs.existsSync(VALID_TIF_PATH)) fs.unlinkSync(VALID_TIF_PATH);
    if (fs.existsSync(TEST_OUTPUT_DIR)) fs.rmdirSync(TEST_OUTPUT_DIR);
    if (fs.existsSync(TEST_DIR)) fs.rmdirSync(TEST_DIR);
  } catch (cleanErr) {
    // Ignore cleanup errors
  }

  // Restore MLPrediction.findOne
  MLPrediction.findOne = originalFindOne;

  // Print results
  console.log('\n=== PHASE 4D TEST RESULTS ===\n');
  for (const r of results) {
    if (r.ok) {
      console.log(`  ✅  ${r.name}`);
    } else {
      console.error(`  ❌  ${r.name}: ${r.error}`);
    }
  }
  console.log(`\n  Total: ${results.length}  |  Passed: ${passed}  |  Failed: ${failed}\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
