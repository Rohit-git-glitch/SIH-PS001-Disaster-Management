const app = require('../src/app');
const connectDB = require('../src/config/db');
const mongoose = require('mongoose');

async function runTests() {
  console.log('--- Connecting to MongoDB ---');
  await connectDB();

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;
  console.log(`Test server running at ${baseUrl}`);

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

  try {
    // 1. Existing GET /api/health
    console.log('\n--- 1. Health Check Test ---');
    const healthRes = await fetch(`${baseUrl}/api/health`);
    const healthData = await healthRes.json();
    assert(healthRes.status === 200, `GET /api/health returned 200 (Got ${healthRes.status})`);
    assert(healthData.status === 'success', `Health status is 'success'`);
    assert(healthData.database === 'connected', `Database status is 'connected'`);

    // 2. Existing Location APIs
    console.log('\n--- 2. Location APIs Test ---');
    const locsRes = await fetch(`${baseUrl}/api/locations`);
    const locsData = await locsRes.json();
    assert(locsRes.status === 200, `GET /api/locations returned 200`);

    // Check if LOC-AS-001 exists, if not create it
    const locRes = await fetch(`${baseUrl}/api/locations/LOC-AS-001`);
    if (locRes.status === 404) {
      console.log('Registering LOC-AS-001 for test...');
      const createLocRes = await fetch(`${baseUrl}/api/locations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locationId: 'LOC-AS-001',
          name: 'Guwahati Monitoring Point A',
          district: 'Kamrup Metropolitan',
          latitude: 26.1445,
          longitude: 91.7362
        })
      });
      assert(createLocRes.status === 201, `POST /api/locations created LOC-AS-001 with 201`);
    } else {
      assert(locRes.status === 200, `GET /api/locations/LOC-AS-001 exists with status 200`);
    }

    // 3 & 4. POST valid environmental record containing soilClay (HTTP 201)
    console.log('\n--- 3 & 4. POST Environmental Data with soilClay ---');
    const validPayload = {
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
      recordedAt: '2099-01-01T00:00:00.000Z'
    };

    const postRes = await fetch(`${baseUrl}/api/environmental-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validPayload)
    });
    const postData = await postRes.json();
    assert(postRes.status === 201, `POST /api/environmental-data returned 201 (Got ${postRes.status})`);
    assert(postData.data?.environmentalData?.soilClay === 24.5, `Returned record contains soilClay = 24.5 (Got ${postData.data?.environmentalData?.soilClay})`);

    // 5. GET /api/environmental-data/LOC-AS-001 returns soilClay
    console.log('\n--- 5. GET /api/environmental-data/LOC-AS-001 ---');
    const getRecordsRes = await fetch(`${baseUrl}/api/environmental-data/LOC-AS-001`);
    const getRecordsData = await getRecordsRes.json();
    assert(getRecordsRes.status === 200, `GET /api/environmental-data/LOC-AS-001 returned 200`);
    const matchingRecord = getRecordsData.data?.records?.find(r => r.soilClay === 24.5);
    assert(!!matchingRecord, `GET records contains record with soilClay === 24.5`);

    // 6. GET /api/environmental-data/LOC-AS-001/latest returns soilClay
    console.log('\n--- 6. GET /api/environmental-data/LOC-AS-001/latest ---');
    const getLatestRes = await fetch(`${baseUrl}/api/environmental-data/LOC-AS-001/latest`);
    const getLatestData = await getLatestRes.json();
    assert(getLatestRes.status === 200, `GET /api/environmental-data/LOC-AS-001/latest returned 200`);
    assert(getLatestData.data?.environmentalData?.soilClay !== undefined, `Latest record has soilClay defined`);
    assert(getLatestData.data?.environmentalData?.soilClay === 24.5, `Latest record has soilClay === 24.5 (Got ${getLatestData.data?.environmentalData?.soilClay})`);

    // 7. Test invalid soilClay (e.g. soilClay: -5)
    console.log('\n--- 7. Invalid soilClay Rejection (HTTP 400) ---');
    const invalidPayload = {
      locationId: 'LOC-AS-001',
      rainfall: 10,
      soilClay: -5,
      recordedAt: '2026-09-16T14:00:00.000Z'
    };
    const invalidRes = await fetch(`${baseUrl}/api/environmental-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invalidPayload)
    });
    const invalidData = await invalidRes.json();
    assert(invalidRes.status === 400, `POST with negative soilClay (-5) rejected with 400 (Got ${invalidRes.status})`);
    assert(invalidData.status === 'fail', `Error response status is 'fail'`);

    // 7b. Test non-numeric soilClay
    const nonNumericPayload = {
      locationId: 'LOC-AS-001',
      rainfall: 10,
      soilClay: 'abc',
      recordedAt: '2026-09-16T14:05:00.000Z'
    };
    const nonNumericRes = await fetch(`${baseUrl}/api/environmental-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nonNumericPayload)
    });
    assert(nonNumericRes.status === 400, `POST with non-numeric soilClay ('abc') rejected with 400 (Got ${nonNumericRes.status})`);

    // 8. Verify record without soilClay still works (optional field)
    console.log('\n--- 8. Record Without soilClay (Optional Field) ---');
    const optionalPayload = {
      locationId: 'LOC-AS-001',
      rainfall: 15.0,
      cumulativeRainfall: 40.0,
      elevation: 500,
      slope: 20,
      recordedAt: '2026-09-16T15:00:00.000Z'
    };
    const optionalRes = await fetch(`${baseUrl}/api/environmental-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(optionalPayload)
    });
    const optionalData = await optionalRes.json();
    assert(optionalRes.status === 201, `POST without soilClay succeeded with 201 (Got ${optionalRes.status})`);
    assert(optionalData.data?.environmentalData?.soilClay === null, `soilClay defaults to null when omitted (Got ${optionalData.data?.environmentalData?.soilClay})`);

    // 8b. Record with explicit null soilClay
    const nullPayload = {
      locationId: 'LOC-AS-001',
      rainfall: 20.0,
      soilClay: null,
      recordedAt: '2026-09-16T15:30:00.000Z'
    };
    const nullRes = await fetch(`${baseUrl}/api/environmental-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nullPayload)
    });
    const nullData = await nullRes.json();
    assert(nullRes.status === 201, `POST with explicit null soilClay succeeded with 201`);
    assert(nullData.data?.environmentalData?.soilClay === null, `soilClay accepted null (Got ${nullData.data?.environmentalData?.soilClay})`);

  } catch (err) {
    console.error('Test step exception:', err);
    failed++;
  } finally {
    server.close();
    await mongoose.connection.close();
    console.log('\n--- Summary ---');
    console.log(`Total Passed: ${passed}`);
    console.log(`Total Failed: ${failed}`);
    if (failed > 0) {
      process.exit(1);
    } else {
      console.log('ALL VERIFICATIONS PASSED SUCCESSFULLY!');
      process.exit(0);
    }
  }
}

runTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
