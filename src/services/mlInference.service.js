// src/services/mlInference.service.js

/**
 * Service responsible for orchestrating the Python GeoTIFF inference pipeline.
 *
 * Security model:
 *   - Clients supply ONLY a basename or relative filename (e.g. "Assam_6Feature.tif").
 *   - The service resolves the path relative to INPUT_DIR and verifies it stays inside.
 *   - Absolute paths, ".." traversal, and paths outside INPUT_DIR are all rejected.
 *   - PYTHON_EXEC, INFERENCE_SCRIPT, and MODEL_PATH are configured server-side only
 *     and are NEVER accepted from the client.
 *
 * Lifecycle (asynchronous):
 *   1. Validate input filename  →  resolve safe absolute path
 *   2. Create MLPrediction document  (status: PROCESSING)
 *   3. Return the document to the caller (controller responds 202 immediately)
 *   4. Python process runs in background
 *   5. On exit: read metadata JSON → update document  (status: COMPLETED or FAILED)
 */

const path   = require('path');
const fs     = require('fs');
const { spawn } = require('child_process');
const crypto = require('crypto');
const MLPrediction = require('../models/mlPrediction.model');

// ---------------------------------------------------------------------------
// Configuration – server-side only, never taken from client request
// ---------------------------------------------------------------------------
const PYTHON_EXEC       = process.env.ML_PYTHON_PATH     || 'python';
const INFERENCE_SCRIPT  = process.env.ML_INFERENCE_SCRIPT
  || path.join(__dirname, '../../ml_inference/predict.py');
const MODEL_PATH        = process.env.ML_MODEL_PATH
  || path.join(__dirname, '../../ml_inference/assam_landslide_xgb_model.json');
const INPUT_DIR  = process.env.ML_INPUT_DIR  || path.join(__dirname, '../../ml_inference/inputs');
const OUTPUT_DIR = process.env.ML_OUTPUT_DIR || path.join(__dirname, '../../ml_inference/outputs');

// Ensure directories exist (create if missing)
if (!fs.existsSync(INPUT_DIR))  fs.mkdirSync(INPUT_DIR,  { recursive: true });
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Helper: generate unique business prediction ID
// Format: PRED-AS-<timestamp>-<randomHex>
// ---------------------------------------------------------------------------
function generatePredictionId() {
  const timestamp = Date.now();
  const rnd = crypto.randomBytes(4).toString('hex');
  return `PRED-AS-${timestamp}-${rnd}`;
}

// ---------------------------------------------------------------------------
// Helper: validate that clientFilename is safe and resolve to absolute path.
//
// Rules:
//   • clientFilename must be a non-empty string
//   • Must not be absolute (starts with / or drive letter)
//   • Must not contain ".." segments
//   • Must not contain null bytes
//   • Resolved absolute path must start with INPUT_DIR (path.sep appended)
//   • File must exist at the resolved path
// ---------------------------------------------------------------------------
function validateAndResolveInput(clientFilename) {
  if (!clientFilename || typeof clientFilename !== 'string') {
    throw new Error('inputPath must be a non-empty string filename.');
  }

  const trimmed = clientFilename.trim();
  if (!trimmed) {
    throw new Error('inputPath must be a non-empty string filename.');
  }

  // Reject absolute paths (cross-platform: POSIX, Windows drive letter, Windows UNC)
  if (
    path.isAbsolute(trimmed) ||
    path.posix.isAbsolute(trimmed) ||
    path.win32.isAbsolute(trimmed) ||
    /^[a-zA-Z]:/.test(trimmed) ||
    /^[\\]{2}/.test(trimmed)
  ) {
    throw new Error('Absolute paths are not permitted. Supply only a filename or relative path.');
  }

  // Reject null bytes
  if (trimmed.includes('\0')) {
    throw new Error('Null bytes are not permitted in the filename.');
  }

  // Reject traversal sequences (cross-platform separators)
  const segments = trimmed.split(/[/\\]/);
  if (segments.includes('..') || trimmed.includes('..')) {
    throw new Error('Path traversal ("..") is not permitted.');
  }

  const normalised = path.normalize(trimmed);
  if (normalised.includes('..')) {
    throw new Error('Path traversal ("..") is not permitted.');
  }

  // Resolve relative to INPUT_DIR
  const resolved = path.resolve(INPUT_DIR, normalised);
  const allowedBase = path.resolve(INPUT_DIR);

  if (!resolved.startsWith(allowedBase + path.sep) && resolved !== allowedBase) {
    throw new Error('Resolved path falls outside the allowed input directory.');
  }

  if (!fs.existsSync(resolved)) {
    throw new Error(`Input GeoTIFF file not found: ${normalised}`);
  }

  return resolved;
}

// ---------------------------------------------------------------------------
// Helper: apply resolution-scalar policy.
//
// Policy (from approved Phase 4C spec):
//   • metadata.resolution must be a two-element array [pixelWidth, pixelHeight]
//   • Both values must be equal (square pixels)
//   • CRS must NOT be geographic (EPSG:4326 or similar degree-based CRS)
//   • If all conditions met → return scalar (Number)
//   • Otherwise → return null  (caller stores null + descriptive note)
//   • NEVER approximate degrees → metres
// ---------------------------------------------------------------------------
function resolveScalarResolution(metadata) {
  const res = metadata.resolution;
  const crs = (metadata.crs || '').toLowerCase();

  if (!Array.isArray(res) || res.length !== 2) return null;
  if (typeof res[0] !== 'number' || typeof res[1] !== 'number') return null;

  // Non-square pixels cannot be collapsed to a scalar
  if (Math.abs(res[0] - res[1]) > Number.EPSILON) return null;

  // Geographic CRS — degrees cannot be stored as metres
  // Detect EPSG:4326, CRS84, WGS84, and any string containing "4326" or "degree"
  if (/4326|crs84|wgs\s*84.*degree|degree/.test(crs)) return null;

  const scalar = res[0];
  if (scalar <= 0) return null;

  return scalar;
}

// ---------------------------------------------------------------------------
// Internal: update MLPrediction document after Python process finishes.
// Runs in background – any throw here is caught and used to mark FAILED.
// ---------------------------------------------------------------------------
async function _finaliseDocument(mlDoc, outputTif, outputJson) {
  // Verify output files exist
  if (!fs.existsSync(outputTif) || !fs.existsSync(outputJson)) {
    mlDoc.status = 'FAILED';
    mlDoc.notes  = 'Python reported success but expected output files are missing.';
    await mlDoc.save();
    return;
  }

  // Read metadata JSON
  let metadata;
  try {
    const raw = fs.readFileSync(outputJson, 'utf-8');
    metadata  = JSON.parse(raw);
  } catch (e) {
    mlDoc.status = 'FAILED';
    mlDoc.notes  = `Failed to parse inference metadata JSON: ${e.message}`;
    await mlDoc.save();
    return;
  }

  // Apply resolution scalar policy
  const scalarRes = resolveScalarResolution(metadata);
  if (scalarRes === null) {
    mlDoc.resolution = null;
    mlDoc.notes = `Resolution stored as null per policy — original: ${JSON.stringify(metadata.resolution)}; CRS: ${metadata.crs}`;
  } else {
    mlDoc.resolution = scalarRes;
    mlDoc.notes = null;
  }

  // Map remaining metadata fields
  mlDoc.modelName       = metadata.modelName       || 'XGBoost';
  mlDoc.modelVersion    = metadata.modelVersion    || 'assam_landslide_xgb_model';
  mlDoc.studyArea       = metadata.studyArea       || 'Assam';
  mlDoc.outputType      = metadata.outputType      || 'LANDSLIDE_PROBABILITY_RASTER';
  mlDoc.fileName        = metadata.fileName        || path.basename(outputTif);
  mlDoc.filePath        = outputTif;
  mlDoc.crs             = metadata.crs             || null;
  mlDoc.bounds          = metadata.bounds          || null;
  mlDoc.minProbability  = metadata.minProbability  != null ? metadata.minProbability  : null;
  mlDoc.maxProbability  = metadata.maxProbability  != null ? metadata.maxProbability  : null;
  mlDoc.generatedAt     = metadata.generatedAt ? new Date(metadata.generatedAt) : new Date();
  mlDoc.status          = 'COMPLETED';
  // features field is not in Phase 4A schema — skip to avoid unknown field errors

  await mlDoc.save();
}

// ---------------------------------------------------------------------------
// Internal: background runner — spawns Python, then calls _finaliseDocument.
// Errors are caught and written to the MLPrediction document.
// ---------------------------------------------------------------------------
async function _runBackground(mlDoc, safeInputPath, outputTif, outputJson) {
  const args = [
    INFERENCE_SCRIPT,
    '--model',  MODEL_PATH,
    '--input',  safeInputPath,
    '--output', outputTif,
  ];

  let stderr = '';

  const pyProcess = spawn(PYTHON_EXEC, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  pyProcess.stderr.on('data', (data) => { stderr += data.toString(); });

  const exitCode = await new Promise((resolve) => {
    pyProcess.on('close', resolve);
  });

  if (exitCode !== 0) {
    mlDoc.status = 'FAILED';
    mlDoc.notes  = `Python process exited with code ${exitCode}. Stderr: ${stderr.slice(0, 1000)}`;
    await mlDoc.save();
    return;
  }

  await _finaliseDocument(mlDoc, outputTif, outputJson);
}

// ---------------------------------------------------------------------------
// Public API
//
// runInference(clientFilename)
//   • Validates filename
//   • Creates PROCESSING document
//   • Starts background Python execution (fire-and-forget)
//   • Returns the PROCESSING document immediately
// ---------------------------------------------------------------------------
async function runInference(clientFilename) {
  // 1. Validate and resolve path
  const safeInputPath = validateAndResolveInput(clientFilename);

  // 2. Generate prediction ID
  const predictionId = generatePredictionId();

  // 3. Build output file paths
  const inputBase = path.parse(safeInputPath).name;
  const outputTif  = path.join(OUTPUT_DIR, `${inputBase}_probability.tif`);
  const outputJson = outputTif.replace(/\.tif$/i, '.json');

  // 4. Create PROCESSING document
  const mlDoc = new MLPrediction({
    predictionId,
    status:      'PROCESSING',
    generatedAt: new Date(),
    // These required fields have schema defaults, but supply them explicitly
    // to satisfy the 'required' validators without waiting for Python output
    modelName:   'XGBoost',
    modelVersion: 'assam_landslide_xgb_model',
    studyArea:   'Assam',
    outputType:  'LANDSLIDE_PROBABILITY_RASTER',
    fileName:    `${inputBase}_probability.tif`,
  });
  await mlDoc.save();

  // 5. Fire-and-forget: run Python in background, update doc on completion
  _runBackground(mlDoc, safeInputPath, outputTif, outputJson).catch((err) => {
    // Last-resort catch — should not normally reach here
    mlDoc.status = 'FAILED';
    mlDoc.notes  = `Unexpected orchestration error: ${err.message}`;
    mlDoc.save().catch(() => {});
  });

  // 6. Return immediately with PROCESSING document
  return mlDoc;
}

// ---------------------------------------------------------------------------
module.exports = {
  runInference,
  // Exposed for unit testing
  validateAndResolveInput,
  resolveScalarResolution,
  generatePredictionId,
  INPUT_DIR,
};
