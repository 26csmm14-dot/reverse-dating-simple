// test-phase1.js - Automated Verification Suite for Phase 1
const http = require('http');
const assert = require('assert');
const server = require('./server.js');
const db = require('./db.js');

const TEST_PORT = 3088;
const BASE_URL = `http://localhost:${TEST_PORT}`;

// Helper: Make HTTP request using built-in http module
function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const reqHeaders = { ...headers };
    let payload = null;

    if (body) {
      payload = typeof body === 'string' ? body : JSON.stringify(body);
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request(
      url,
      {
        method,
        headers: reqHeaders,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(data);
          } catch (e) {}
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data,
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

async function runTests() {
  console.log('--- Starting Phase 1 Automated Verification Suite ---');

  // 1. Connect database
  await db.connectDB();
  console.log('✓ Database service initialized');

  // 2. Start server
  await new Promise((resolve) => server.listen(TEST_PORT, resolve));
  console.log(`✓ Test HTTP server listening on port ${TEST_PORT}`);

  try {
    // 3. Test static file: index.html
    const resIndex = await request('GET', '/');
    assert.strictEqual(resIndex.statusCode, 200, 'GET / should return 200 OK');
    assert(resIndex.headers['content-type'].includes('text/html'), 'Content-Type should be text/html');
    assert(resIndex.body.includes('WANNA DATE U'), 'index.html contains title');
    assert(resIndex.body.includes('onboardingForm'), 'index.html contains onboarding form');
    console.log('✓ Test 1: Static file serving (index.html) passed');

    // 4. Test static file: css/style.css
    const resCss = await request('GET', '/css/style.css');
    assert.strictEqual(resCss.statusCode, 200, 'GET /css/style.css should return 200 OK');
    assert(resCss.headers['content-type'].includes('text/css'), 'Content-Type should be text/css');
    assert(resCss.body.includes('--accent: #f472b6;'), 'style.css defines baby pink theme');
    console.log('✓ Test 2: Static file serving (style.css) passed');

    // 5. Test static file: js/onboarding.js
    const resJs = await request('GET', '/js/onboarding.js');
    assert.strictEqual(resJs.statusCode, 200, 'GET /js/onboarding.js should return 200 OK');
    assert(resJs.headers['content-type'].includes('application/javascript'), 'Content-Type should be javascript');
    console.log('✓ Test 3: Static file serving (onboarding.js) passed');

    // 6. Test POST /api/auth (Registration)
    const testCandidate = {
      name: 'Rhea Sharma',
      contactType: 'instagram',
      contact: '@rhea_sharma_test',
      photo: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb',
      expectations: 'Looking for thoughtful conversations and good coffee.',
    };

    const resAuthPost = await request('POST', '/api/auth', testCandidate);
    assert.strictEqual(resAuthPost.statusCode, 200, 'POST /api/auth should return 200 OK');
    assert.strictEqual(resAuthPost.json?.success, true, 'success field should be true');
    assert(resAuthPost.json?.applicant?.id, 'applicant should have an ID');
    assert.strictEqual(resAuthPost.json?.applicant?.name, 'Rhea Sharma');
    assert(resAuthPost.headers['set-cookie'], 'Set-Cookie header should be present');
    console.log('✓ Test 4: POST /api/auth (Applicant Registration) passed');

    const createdId = resAuthPost.json.applicant.id;

    // 7. Test GET /api/auth (Session Retrieval via query)
    const resAuthGet = await request('GET', `/api/auth?applicant_id=${createdId}`);
    assert.strictEqual(resAuthGet.statusCode, 200, 'GET /api/auth should return 200 OK');
    assert.strictEqual(resAuthGet.json?.authenticated, true, 'authenticated should be true');
    assert.strictEqual(resAuthGet.json?.applicant?.contact, '@rhea_sharma_test');
    assert.strictEqual(resAuthGet.json?.applicant?.status, 'viewing');
    console.log('✓ Test 5: GET /api/auth (Session Verification) passed');

    // 8. Test GET /api/status
    const resStatus = await request('GET', `/api/status?applicant_id=${createdId}`);
    assert.strictEqual(resStatus.statusCode, 200, 'GET /api/status should return 200 OK');
    assert.strictEqual(resStatus.json?.status, 'viewing', 'initial status is viewing');
    console.log('✓ Test 6: GET /api/status (Status polling) passed');

    // 9. Test DELETE /api/auth (Logout)
    const resLogout = await request('DELETE', '/api/auth');
    assert.strictEqual(resLogout.statusCode, 200, 'DELETE /api/auth should return 200 OK');
    assert(resLogout.headers['set-cookie'], 'Set-Cookie header expires cookie on logout');
    console.log('✓ Test 7: DELETE /api/auth (Session Logout) passed');

    console.log('\n=============================================');
    console.log('ALL PHASE 1 AUTOMATED TESTS PASSED CLEANLY! ✓');
    console.log('=============================================');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Test Failure:', err.message);
    process.exit(1);
  } finally {
    server.close();
  }
}

runTests();
