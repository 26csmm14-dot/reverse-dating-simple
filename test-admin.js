// test-admin.js - Automated Test Suite for Web Admin Panel Endpoints
const http = require('http');
const assert = require('assert');
const server = require('./server');
const db = require('./db');

const TEST_PORT = 3091;

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: 'localhost',
        port: TEST_PORT,
        path,
        method,
        headers: {
          ...headers,
          ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let rawData = '';
        res.on('data', (chunk) => (rawData += chunk));
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(rawData);
          } catch (e) {}
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: rawData,
            json,
          });
        });
      }
    );

    req.on('error', (err) => reject(err));
    if (payload) req.write(payload);
    req.end();
  });
}

async function runAdminTests() {
  console.log('--- Starting Admin Dashboard Automated Verification Suite ---');

  await db.connectDB();
  console.log('✓ Database connected');

  await new Promise((resolve) => server.listen(TEST_PORT, resolve));
  console.log(`✓ Test HTTP server listening on port ${TEST_PORT}`);

  try {
    // Test 1: Static serving of /admin.html
    const resAdminPage = await request('GET', '/admin.html');
    assert.strictEqual(resAdminPage.statusCode, 200, 'GET /admin.html returns 200');
    assert(resAdminPage.body.includes('Command Center'), 'contains Command Center heading');
    assert(resAdminPage.body.includes('/api/admin/decide'), 'contains decide API call');
    console.log('✓ Test 1: Static serving of /admin.html verified');

    // Test 2: GET /api/admin/applicants returns applicant array
    const resList = await request('GET', '/api/admin/applicants');
    assert.strictEqual(resList.statusCode, 200, 'GET /api/admin/applicants returns 200');
    assert.strictEqual(resList.json.success, true, 'success flag is true');
    assert(Array.isArray(resList.json.applicants), 'applicants is an array');
    console.log(`✓ Test 2: GET /api/admin/applicants verified (${resList.json.applicants.length} records)`);

    // Test 3: Register a new candidate
    const uniqueContact = `admin_test_${Date.now()}@instagram.com`;
    const resAuth = await request('POST', '/api/auth', {
      name: 'Aditi Rao',
      contactType: 'instagram',
      contact: uniqueContact,
      expectations: 'Looking for a genuine connection',
    });
    assert.strictEqual(resAuth.statusCode, 200);
    const applicantId = resAuth.json.applicant.id;
    console.log('✓ Test 3: New candidate registered (Aditi Rao)');

    // Test 4: Submit proposal
    const resApply = await request('POST', '/api/apply', {
      applicantId: applicantId,
      firstDateIdea: 'Late Night Rooftop Astronomy',
      pitch: 'Ready to stargaze together!',
    });
    assert.strictEqual(resApply.statusCode, 200);
    assert.strictEqual(resApply.json.applicant.status, 'pending');
    console.log('✓ Test 4: Candidate proposal submitted (status: pending)');

    // Test 5: Verify candidate appears in admin list
    const resListAfter = await request('GET', '/api/admin/applicants');
    const found = resListAfter.json.applicants.find((a) => a.id === applicantId);
    assert(found, 'Candidate must appear in admin list');
    assert.strictEqual(found.status, 'pending');
    console.log('✓ Test 5: Candidate appears in admin list as pending');

    // Test 6: Admin accepts candidate via POST /api/admin/decide
    const resAccept = await request('POST', '/api/admin/decide', {
      applicantId: applicantId,
      action: 'accept',
    });
    assert.strictEqual(resAccept.statusCode, 200);
    assert.strictEqual(resAccept.json.success, true);
    assert.strictEqual(resAccept.json.status, 'accepted');
    console.log('✓ Test 6: Admin accepted candidate via POST /api/admin/decide');

    // Test 7: Verify candidate polling returns accepted
    const resPoll = await request('GET', `/api/status?applicant_id=${applicantId}`);
    assert.strictEqual(resPoll.json.status, 'accepted');
    console.log('✓ Test 7: Candidate status polling returns accepted');

    // Test 8: Register second candidate and reject via admin
    const uniqueContact2 = `admin_test2_${Date.now()}@instagram.com`;
    const resAuth2 = await request('POST', '/api/auth', {
      name: 'Pooja Hegde',
      contactType: 'instagram',
      contact: uniqueContact2,
    });
    const applicantId2 = resAuth2.json.applicant.id;
    await request('POST', '/api/apply', { applicantId: applicantId2 });

    const resReject = await request('POST', '/api/admin/decide', {
      applicantId: applicantId2,
      action: 'reject',
    });
    assert.strictEqual(resReject.statusCode, 200);
    assert.strictEqual(resReject.json.status, 'rejected');

    const resPoll2 = await request('GET', `/api/status?applicant_id=${applicantId2}`);
    assert.strictEqual(resPoll2.json.status, 'rejected');
    console.log('✓ Test 8: Admin rejected candidate via POST /api/admin/decide (polling reports rejected)');

    console.log('\n=============================================');
    console.log('ALL ADMIN DASHBOARD TESTS PASSED CLEANLY! ✓');
    console.log('=============================================\n');
    process.exit(0);
  } finally {
    server.close();
  }
}

runAdminTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
