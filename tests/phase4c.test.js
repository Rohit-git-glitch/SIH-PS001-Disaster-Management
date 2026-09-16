// tests/phase4c.test.js
// Phase 4C — ML Inference Orchestration Tests
//
// Run with: node tests/phase4c.test.js
//
// Test coverage:
//   1. validateAndResolveInput – security / path validation
//   2. resolveScalarResolution – resolution policy
//   3. generatePredictionId – ID format
//   4. runInference – end-to-end stub (no real Python / MongoDB needed)
//   5. Controller helper – request/response shape
//   6. Route registration sanity
//
// These tests use NO external test framework; they rely only on Node built-ins.

'use strict';

const path   = require('path');
const fs     = require('fs');
const assert = require('assert');

// ---------------------------------------------------------------------------
// Test utilities
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;
const results = [];

function test(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
    passed++;
  } catch (e) {
    results.push({ name, ok: false, error: e.message });
    failed++;
  }
}

function throws(fn, msgFragment) {
  let threw = false;
  let actualMsg = '';
  try { fn(); } catch (e) { threw = true; actualMsg = e.message; }
  assert.ok(threw, `Expected function to throw (fragment: "${msgFragment}")`);
  if (msgFragment) {
    assert.ok(
      actualMsg.includes(msgFragment),
      `Expected error message to include "${msgFragment}" but got: "${actualMsg}"`
    );
  }
}

// ---------------------------------------------------------------------------
// Prepare a real INPUT_DIR with a dummy .tif for path-resolution tests
// ---------------------------------------------------------------------------
const FAKE_INPUT_DIR = path.join(__dirname, '__test_inputs__');
const FAKE_TIF = path.join(FAKE_INPUT_DIR, 'sample.tif');

if (!fs.existsSync(FAKE_INPUT_DIR)) fs.mkdirSync(FAKE_INPUT_DIR, { recursive: true });
if (!fs.existsSync(FAKE_TIF))       fs.writeFileSync(FAKE_TIF, 'FAKE_TIF_DATA');

// Patch the service to use our fake input dir so tests don't depend on the
// real ml_inference/inputs directory being populated.
process.env.ML_INPUT_DIR  = FAKE_INPUT_DIR;
process.env.ML_OUTPUT_DIR = path.join(__dirname, '__test_outputs__');
if (!fs.existsSync(process.env.ML_OUTPUT_DIR)) {
  fs.mkdirSync(process.env.ML_OUTPUT_DIR, { recursive: true });
}

// Now require the service (after setting env vars)
const {
  validateAndResolveInput,
  resolveScalarResolution,
  generatePredictionId,
  INPUT_DIR,
} = require('../src/services/mlInference.service');

// ===========================================================================
// GROUP 1: validateAndResolveInput
// ===========================================================================

test('validateAndResolveInput — accepts a valid filename', () => {
  const result = validateAndResolveInput('sample.tif');
  assert.strictEqual(result, FAKE_TIF);
});

test('validateAndResolveInput — rejects empty string', () => {
  throws(() => validateAndResolveInput(''), 'non-empty string');
});

test('validateAndResolveInput — rejects null', () => {
  throws(() => validateAndResolveInput(null), 'non-empty string');
});

test('validateAndResolveInput — rejects undefined', () => {
  throws(() => validateAndResolveInput(undefined), 'non-empty string');
});

test('validateAndResolveInput — rejects absolute path (Unix-style)', () => {
  throws(() => validateAndResolveInput('/etc/passwd'), 'Absolute paths');
});

test('validateAndResolveInput — rejects absolute path (Windows-style drive letter)', () => {
  throws(() => validateAndResolveInput('C:\\Windows\\system32\\file.tif'), 'Absolute paths');
});

test('validateAndResolveInput — rejects "../" traversal', () => {
  throws(() => validateAndResolveInput('../outside.tif'), 'Path traversal');
});

test('validateAndResolveInput — rejects deep traversal', () => {
  throws(() => validateAndResolveInput('sub/../../outside.tif'), 'Path traversal');
});

test('validateAndResolveInput — rejects null bytes', () => {
  throws(() => validateAndResolveInput('file\0name.tif'), 'Null bytes');
});

test('validateAndResolveInput — rejects file that does not exist', () => {
  throws(() => validateAndResolveInput('nonexistent_file.tif'), 'not found');
});

test('validateAndResolveInput — INPUT_DIR is correctly set from env', () => {
  assert.strictEqual(INPUT_DIR, FAKE_INPUT_DIR);
});

// ===========================================================================
// GROUP 2: resolveScalarResolution
// ===========================================================================

test('resolveScalarResolution — returns scalar for projected square pixels', () => {
  const result = resolveScalarResolution({ resolution: [100, 100], crs: 'EPSG:32646' });
  assert.strictEqual(result, 100);
});

test('resolveScalarResolution — returns scalar for 30m Landsat resolution', () => {
  const result = resolveScalarResolution({ resolution: [30, 30], crs: 'EPSG:32646' });
  assert.strictEqual(result, 30);
});

test('resolveScalarResolution — returns null for geographic CRS (EPSG:4326)', () => {
  const result = resolveScalarResolution({ resolution: [0.001, 0.001], crs: 'EPSG:4326' });
  assert.strictEqual(result, null);
});

test('resolveScalarResolution — returns null for CRS string containing "4326"', () => {
  const result = resolveScalarResolution({ resolution: [0.001, 0.001], crs: 'WGS 84 / EPSG:4326' });
  assert.strictEqual(result, null);
});

test('resolveScalarResolution — returns null for non-square pixels', () => {
  const result = resolveScalarResolution({ resolution: [100, 90], crs: 'EPSG:32646' });
  assert.strictEqual(result, null);
});

test('resolveScalarResolution — returns null for scalar resolution (not array)', () => {
  const result = resolveScalarResolution({ resolution: 100, crs: 'EPSG:32646' });
  assert.strictEqual(result, null);
});

test('resolveScalarResolution — returns null for missing resolution', () => {
  const result = resolveScalarResolution({ crs: 'EPSG:32646' });
  assert.strictEqual(result, null);
});

test('resolveScalarResolution — returns null for null resolution', () => {
  const result = resolveScalarResolution({ resolution: null, crs: 'EPSG:32646' });
  assert.strictEqual(result, null);
});

test('resolveScalarResolution — returns null for resolution array with wrong length', () => {
  const result = resolveScalarResolution({ resolution: [100], crs: 'EPSG:32646' });
  assert.strictEqual(result, null);
});

test('resolveScalarResolution — returns null for zero resolution', () => {
  const result = resolveScalarResolution({ resolution: [0, 0], crs: 'EPSG:32646' });
  assert.strictEqual(result, null);
});

test('resolveScalarResolution — returns null for negative resolution', () => {
  const result = resolveScalarResolution({ resolution: [-100, -100], crs: 'EPSG:32646' });
  assert.strictEqual(result, null);
});

test('resolveScalarResolution — returns null for CRS containing "degree"', () => {
  const result = resolveScalarResolution({
    resolution: [0.001, 0.001],
    crs: 'WGS 84 (degree)',
  });
  assert.strictEqual(result, null);
});

// ===========================================================================
// GROUP 3: generatePredictionId
// ===========================================================================

test('generatePredictionId — returns string starting with PRED-AS-', () => {
  const id = generatePredictionId();
  assert.ok(typeof id === 'string');
  assert.ok(id.startsWith('PRED-AS-'));
});

test('generatePredictionId — format is PRED-AS-<digits>-<8hex>', () => {
  const id = generatePredictionId();
  // e.g. PRED-AS-1726493930000-a1b2c3d4
  assert.ok(/^PRED-AS-\d{13}-[0-9a-f]{8}$/.test(id), `ID "${id}" does not match expected format`);
});

test('generatePredictionId — returns unique IDs on repeated calls', () => {
  const ids = new Set(Array.from({ length: 20 }, generatePredictionId));
  assert.strictEqual(ids.size, 20);
});

// ===========================================================================
// GROUP 4: Controller — request validation
// ===========================================================================

// Mock res / next for testing the controller function directly
function makeRes() {
  const res = { _status: null, _body: null };
  res.status = (code) => { res._status = code; return res; };
  res.json   = (body)  => { res._body  = body;  return res; };
  return res;
}

const { runInferenceHandler } = require('../src/controllers/mlPredictionRun.controller');

test('controller — rejects request with missing inputPath', async () => {
  const req  = { body: {} };
  const res  = makeRes();
  const next = (err) => { assert.fail(`next() should not be called: ${err}`); };
  await runInferenceHandler(req, res, next);
  assert.strictEqual(res._status, 400);
  assert.strictEqual(res._body.status, 'fail');
  assert.ok(res._body.message.includes('inputPath'));
});

test('controller — rejects request with empty inputPath', async () => {
  const req  = { body: { inputPath: '   ' } };
  const res  = makeRes();
  const next = (err) => { assert.fail(`next() should not be called: ${err}`); };
  await runInferenceHandler(req, res, next);
  assert.strictEqual(res._status, 400);
});

test('controller — rejects absolute path via inputPath', async () => {
  const req  = { body: { inputPath: '/etc/passwd' } };
  const res  = makeRes();
  const next = (err) => { assert.fail(`next() should not be called: ${err}`); };
  await runInferenceHandler(req, res, next);
  assert.strictEqual(res._status, 400);
  assert.ok(res._body.message.includes('Absolute'));
});

test('controller — rejects path traversal via inputPath', async () => {
  const req  = { body: { inputPath: '../secret.tif' } };
  const res  = makeRes();
  const next = (err) => { assert.fail(`next() should not be called: ${err}`); };
  await runInferenceHandler(req, res, next);
  assert.strictEqual(res._status, 400);
  assert.ok(res._body.message.includes('traversal'));
});

test('controller — rejects non-existent file', async () => {
  const req  = { body: { inputPath: 'does_not_exist.tif' } };
  const res  = makeRes();
  const next = (err) => { assert.fail(`next() should not be called: ${err}`); };
  await runInferenceHandler(req, res, next);
  assert.strictEqual(res._status, 400);
  assert.ok(res._body.message.includes('not found'));
});

// Valid file test — uses the fake sample.tif; Python won't actually run in test env
// so we just verify the 202 + predictionId shape (Python call itself is fire-and-forget)
test('controller — accepts valid filename and returns 202 PROCESSING shape', async () => {
  // Temporarily patch the service module's runInference export so the controller
  // (which requires the module object) picks up the stub.
  const serviceModule = require('../src/services/mlInference.service');
  const original = serviceModule.runInference;
  serviceModule.runInference = async (_filename) => ({
    predictionId: 'PRED-AS-TEST-abc12345',
    status: 'PROCESSING',
  });

  // Re-require controller to pick up the patched module (clear cache first)
  delete require.cache[require.resolve('../src/controllers/mlPredictionRun.controller')];
  const { runInferenceHandler: stubbedHandler } = require('../src/controllers/mlPredictionRun.controller');

  const req  = { body: { inputPath: 'sample.tif' } };
  const res  = makeRes();
  let nextCalled = false;
  const next = (err) => { nextCalled = true; };

  await stubbedHandler(req, res, next);

  // Restore
  serviceModule.runInference = original;
  delete require.cache[require.resolve('../src/controllers/mlPredictionRun.controller')];

  assert.ok(!nextCalled, `next() should not have been called`);
  assert.strictEqual(res._status, 202);
  assert.strictEqual(res._body.status, 'success');
  assert.ok(res._body.data.predictionId);
  assert.strictEqual(res._body.data.status, 'PROCESSING');
  assert.ok(res._body.data.statusEndpoint.includes(res._body.data.predictionId));
});

// ===========================================================================
// GROUP 5: Route registration
// ===========================================================================

test('routes — mlPrediction.routes.js exports a Router', () => {
  const router = require('../src/routes/mlPrediction.routes');
  assert.ok(router);
  assert.strictEqual(typeof router, 'function'); // Express routers are functions
});

test('routes — mlPrediction.routes.js has a POST /run handler registered', () => {
  const router = require('../src/routes/mlPrediction.routes');
  // Express stores route stack internally; find a route matching POST /run
  const stack = router.stack || [];
  const runRoute = stack.find((layer) => {
    const route = layer.route;
    return route && route.path === '/run' && route.methods && route.methods.post;
  });
  assert.ok(runRoute, 'POST /run route not found in router stack');
});

// ===========================================================================
// PRINT RESULTS
// ===========================================================================

console.log('\n=== PHASE 4C TEST RESULTS ===\n');
for (const r of results) {
  const icon = r.ok ? '✅' : '❌';
  console.log(`  ${icon}  ${r.name}`);
  if (!r.ok) console.log(`         Error: ${r.error}`);
}

console.log(`\n  Total: ${passed + failed}  |  Passed: ${passed}  |  Failed: ${failed}\n`);

// Cleanup temp dirs
try {
  fs.rmSync(FAKE_INPUT_DIR,  { recursive: true, force: true });
  fs.rmSync(path.join(__dirname, '__test_outputs__'), { recursive: true, force: true });
} catch (_) {}

if (failed > 0) process.exit(1);
