// test-admin.js - Automated Test Suite for Web Admin Panel Endpoints & Passcode Protection
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
    // Test 1: Static serving of /admin.html (shows lock screen)
    const resAdminPage = await request('GET', '/admin.html');
    assert.strictEqual(resAdminPage.statusCode, 200, 'GET /admin.html returns 200');
    assert(resAdminPage.body.includes('Host Authentication'), 'contains Host Authentication lock screen');
    assert(resAdminPage.body.includes('passwordInput'), 'contains password input');
    console.log('✓ Test 1: Static serving of /admin.html with lock screen verified');

    // Test 2: Unauthenticated access to /api/admin/applicants returns 401
    const resUnauth = await request('GET', '/api/admin/applicants');
    assert.strictEqual(resUnauth.statusCode, 401, 'unauthenticated /api/admin/applicants returns 401');
    assert.strictEqual(resUnauth.json.success, false);
    console.log('✓ Test 2: Protected endpoint /api/admin/applicants rejects unauthenticated requests (401)');

    // Test 3: Wrong passcode login returns 401
    const resWrongLogin = await request('POST', '/api/admin/login', { password: 'wrongpassword' });
    assert.strictEqual(resWrongLogin.statusCode, 401);
    assert.strictEqual(resWrongLogin.json.success, false);
    console.log('✓ Test 3: Failed login with wrong passcode correctly denied (401)');

    // Test 4: Correct passcode login returns 200 and session cookie
    const resLogin = await request('POST', '/api/admin/login', { password: 'pruthvi2026' });
    assert.strictEqual(resLogin.statusCode, 200);
    assert.strictEqual(resLogin.json.success, true);
    assert(resLogin.json.token, 'token is returned');
    const setCookie = resLogin.headers['set-cookie'];
    assert(setCookie, 'set-cookie header present');
    const adminCookie = setCookie[0].split(';')[0];
    console.log('✓ Test 4: Correct passcode authentication succeeded (cookie set)');

    // Test 5: Check session returns authenticated: true
    const resSession = await request('GET', '/api/admin/session', null, { Cookie: adminCookie });
    assert.strictEqual(resSession.statusCode, 200);
    assert.strictEqual(resSession.json.authenticated, true);
    console.log('✓ Test 5: GET /api/admin/session verified (authenticated: true)');

    // Test 6: Authenticated GET /api/admin/applicants returns list
    const resList = await request('GET', '/api/admin/applicants', null, { Cookie: adminCookie });
    assert.strictEqual(resList.statusCode, 200);
    assert.strictEqual(resList.json.success, true);
    assert(Array.isArray(resList.json.applicants));
    console.log(`✓ Test 6: GET /api/admin/applicants with session verified (${resList.json.applicants.length} records)`);

    // Test 7: Register new candidate and submit proposal
    const uniqueContact = `admin_test_${Date.now()}@instagram.com`;
    const resAuth = await request('POST', '/api/auth', {
      name: 'Aditi Rao',
      contactType: 'instagram',
      contact: uniqueContact,
      expectations: 'Looking for a genuine connection',
    });
    const applicantId = resAuth.json.applicant.id;
    await request('POST', '/api/apply', {
      applicantId: applicantId,
      firstDateIdea: 'Late Night Rooftop Astronomy',
      pitch: 'Ready to stargaze together!',
    });
    console.log('✓ Test 7: Candidate registered and proposal submitted');

    // Test 8: Admin accepts candidate via POST /api/admin/decide with session
    const resAccept = await request(
      'POST',
      '/api/admin/decide',
      { applicantId: applicantId, action: 'accept' },
      { Cookie: adminCookie }
    );
    assert.strictEqual(resAccept.statusCode, 200);
    assert.strictEqual(resAccept.json.status, 'accepted');

    const resPoll = await request('GET', `/api/status?applicant_id=${applicantId}`);
    assert.strictEqual(resPoll.json.status, 'accepted');
    console.log('✓ Test 8: Admin accepted candidate via POST /api/admin/decide (status polling confirmed accepted)');

    // Test 9: Register second candidate and reject via admin
    const uniqueContact2 = `admin_test2_${Date.now()}@instagram.com`;
    const resAuth2 = await request('POST', '/api/auth', {
      name: 'Pooja Hegde',
      contactType: 'instagram',
      contact: uniqueContact2,
    });
    const applicantId2 = resAuth2.json.applicant.id;
    await request('POST', '/api/apply', { applicantId: applicantId2 });

    const resReject = await request(
      'POST',
      '/api/admin/decide',
      { applicantId: applicantId2, action: 'reject' },
      { Cookie: adminCookie }
    );
    assert.strictEqual(resReject.statusCode, 200);
    assert.strictEqual(resReject.json.status, 'rejected');

    const resPoll2 = await request('GET', `/api/status?applicant_id=${applicantId2}`);
    assert.strictEqual(resPoll2.json.status, 'rejected');
    console.log('✓ Test 9: Admin rejected candidate via POST /api/admin/decide (status polling confirmed rejected)');

    // Test 10: Admin logout clears session
    const resLogout = await request('POST', '/api/admin/logout', null, { Cookie: adminCookie });
    assert.strictEqual(resLogout.statusCode, 200);
    console.log('✓ Test 10: Host logout verified');

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
