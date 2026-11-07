// test-phase2.js - Automated Verification Suite for Phase 2
const http = require('http');
const assert = require('assert');
const server = require('./server.js');
const db = require('./db.js');

const TEST_PORT = 3089;
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

async function runPhase2Tests() {
  console.log('--- Starting Phase 2 Automated Verification Suite ---');

  // 1. Connect DB
  await db.connectDB();
  console.log('✓ Database connected');

  // 2. Start HTTP server on TEST_PORT
  await new Promise((resolve) => {
    server.listen(TEST_PORT, () => {
      console.log(`✓ Test HTTP server listening on port ${TEST_PORT}`);
      resolve();
    });
  });

  try {
    // Test 1: Static serving of dashboard.html
    const resDashboard = await request('GET', '/dashboard.html');
    assert.strictEqual(resDashboard.statusCode, 200, 'GET /dashboard.html should return 200 OK');
    assert(resDashboard.body.includes('PRUTHVIRAJ'), 'dashboard.html contains host title');
    assert(resDashboard.body.includes('Kristu Jayanti'), 'dashboard.html contains college tag');
    assert(resDashboard.body.includes('Scenic Mountain Trail Trek'), 'dashboard.html contains date ideas');
    console.log('✓ Test 1: dashboard.html static serving and content passed');

    // Test 2: Static serving of js/dashboard.js
    const resJs = await request('GET', '/js/dashboard.js');
    assert.strictEqual(resJs.statusCode, 200, 'GET /js/dashboard.js should return 200 OK');
    assert(resJs.headers['content-type'].includes('application/javascript'), 'dashboard.js MIME type is javascript');
    console.log('✓ Test 2: dashboard.js static serving passed');

    // Test 3: Static serving of accepted.html & rejected.html
    const resAccepted = await request('GET', '/accepted.html');
    assert.strictEqual(resAccepted.statusCode, 200, 'GET /accepted.html should return 200 OK');
    assert(resAccepted.body.includes('Instagram'), 'accepted.html contains unlocked social links');

    const resRejected = await request('GET', '/rejected.html');
    assert.strictEqual(resRejected.statusCode, 200, 'GET /rejected.html should return 200 OK');
    assert(resRejected.body.includes('Connection Not Found'), 'rejected.html contains playful 404 message');
    console.log('✓ Test 3: Status pages (accepted.html & rejected.html) serving passed');

    // Test 4: CSS Theme Verification (baby pink background & white cards, zero purple)
    const resCss = await request('GET', '/css/style.css');
    assert.strictEqual(resCss.statusCode, 200, 'GET /css/style.css should return 200 OK');
    assert(resCss.body.includes('--bg-color: #ffd0dc;'), 'style.css defines baby pink background');
    assert(resCss.body.includes('--card-bg: #ffffff;'), 'style.css defines pure white cards');
    assert(!resCss.body.includes('#8b5cf6'), 'style.css contains no purple');
    assert(!resCss.body.includes('#7c3aed'), 'style.css contains no indigo/violet');
    console.log('✓ Test 4: CSS baby pink theme & zero purple passed');

    // Test 5: Candidate Registration via POST /api/auth
    const uniqueContact = `@anya_roy_${Date.now()}`;
    const testCandidate = {
      name: 'Anya Roy',
      contactType: 'instagram',
      contact: uniqueContact,
      expectations: 'Looking for someone genuine with shared values.',
    };
    const resAuth = await request('POST', '/api/auth', testCandidate);
    assert.strictEqual(resAuth.statusCode, 200, 'POST /api/auth should succeed');
    assert.strictEqual(resAuth.json?.success, true);
    const applicantId = resAuth.json.applicant.id;
    assert(applicantId, 'applicant should have valid ID');
    assert.strictEqual(resAuth.json.applicant.status, 'viewing', 'initial status should be viewing');
    console.log('✓ Test 5: Candidate registration with initial status viewing passed');

    // Test 6: Proposal Submission via POST /api/apply
    const proposalPayload = {
      applicantId: applicantId,
      firstDateIdea: 'Scenic Mountain Trail Trek & Hilltop Sunset',
      pitch: 'I love trekking and early morning fresh air. Let us make this happen!',
    };
    const resApply = await request('POST', '/api/apply', proposalPayload);
    assert.strictEqual(resApply.statusCode, 200, 'POST /api/apply should succeed');
    assert.strictEqual(resApply.json?.success, true);
    assert.strictEqual(resApply.json?.applicant?.status, 'pending', 'status should update to pending');
    assert.strictEqual(resApply.json?.applicant?.firstDateIdea, proposalPayload.firstDateIdea);
    assert.strictEqual(resApply.json?.applicant?.pitch, proposalPayload.pitch);
    console.log('✓ Test 6: Proposal submission via POST /api/apply passed');

    // Test 7: Status Polling via GET /api/status returns pending
    const resStatusPending = await request('GET', `/api/status?applicant_id=${applicantId}`);
    assert.strictEqual(resStatusPending.statusCode, 200, 'GET /api/status should return 200');
    assert.strictEqual(resStatusPending.json?.status, 'pending', 'polling should report pending');
    console.log('✓ Test 7: GET /api/status returns pending status');

    // Test 8: Status Transition Simulation (accept & reject)
    await db.updateApplicant(applicantId, { status: 'accepted' });
    const resStatusAccepted = await request('GET', `/api/status?applicant_id=${applicantId}`);
    assert.strictEqual(resStatusAccepted.json?.status, 'accepted', 'polling should report accepted');

    await db.updateApplicant(applicantId, { status: 'rejected' });
    const resStatusRejected = await request('GET', `/api/status?applicant_id=${applicantId}`);
    assert.strictEqual(resStatusRejected.json?.status, 'rejected', 'polling should report rejected');
    console.log('✓ Test 8: Real-time status transitions (accepted & rejected) verified');

    console.log('\n=============================================');
    console.log('ALL PHASE 2 AUTOMATED TESTS PASSED CLEANLY! ✓');
    console.log('=============================================\n');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Phase 2 test suite failed:', err);
    process.exit(1);
  }
}

runPhase2Tests();
