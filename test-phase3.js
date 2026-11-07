// test-phase3.js - Automated Verification Suite for Phase 3 (Host Decisions & Status Transitions)
const http = require('http');
const assert = require('assert');
const server = require('./server.js');
const db = require('./db.js');

const TEST_PORT = 3090;
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

async function runPhase3Tests() {
  console.log('--- Starting Phase 3 Automated Verification Suite ---');

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
    // Test 1: Host Passcode Authentication
    const resAuthHost = await request('POST', '/api/admin/login', { password: 'pruthvi2026' });
    assert.strictEqual(resAuthHost.statusCode, 200, 'Host login should succeed with correct passcode');
    assert.strictEqual(resAuthHost.json.success, true);
    const hostCookie = resAuthHost.headers['set-cookie'][0].split(';')[0];
    console.log('✓ Test 1: Host passcode authentication verified (cookie set)');

    // Test 2: Candidate Registration via POST /api/auth
    const uniqueContact = `@maya_${Date.now()}`;
    const testCandidate = {
      name: 'Maya Lin',
      contactType: 'instagram',
      contact: uniqueContact,
      expectations: 'Looking for a genuine connection.',
    };
    const resAuth = await request('POST', '/api/auth', testCandidate);
    assert.strictEqual(resAuth.statusCode, 200, 'POST /api/auth should succeed');
    const applicantId = resAuth.json.applicant.id;
    assert.strictEqual(resAuth.json.applicant.status, 'viewing', 'initial status is viewing');
    console.log('✓ Test 2: Candidate registration with status viewing verified');

    // Test 3: Proposal Submission via POST /api/apply
    const proposalPayload = {
      applicantId: applicantId,
      firstDateIdea: 'Scenic Mountain Trail Trek & Hilltop Sunset',
      pitch: 'Let us hike up the hills and watch the sunset together.',
    };
    const resApply = await request('POST', '/api/apply', proposalPayload);
    assert.strictEqual(resApply.statusCode, 200, 'POST /api/apply should succeed');
    assert.strictEqual(resApply.json.applicant.status, 'pending', 'status updated to pending');
    console.log('✓ Test 3: Proposal submission via POST /api/apply updated status to pending');

    // Test 4: Client Polling via GET /api/status returns pending (STATUS-01)
    const resStatusPending = await request('GET', `/api/status?applicant_id=${applicantId}`);
    assert.strictEqual(resStatusPending.statusCode, 200);
    assert.strictEqual(resStatusPending.json.status, 'pending', 'polling reports pending');
    console.log('✓ Test 4: GET /api/status polling returns pending status');

    // Test 5: Host accepts candidate via POST /api/admin/decide (action: accept)
    const resAccept = await request(
      'POST',
      '/api/admin/decide',
      { applicantId, action: 'accept' },
      { Cookie: hostCookie }
    );
    assert.strictEqual(resAccept.statusCode, 200, 'Host accept should succeed');
    assert.strictEqual(resAccept.json.status, 'accepted');

    // Verify applicant in MongoDB is now accepted
    const acceptedApplicant = await db.findApplicantById(applicantId);
    assert.strictEqual(acceptedApplicant.status, 'accepted', 'applicant status updated to accepted');
    console.log('✓ Test 5: Host decision accept updated status to accepted in MongoDB');

    // Test 6: Verify GET /api/status now reports accepted (triggers redirect to accepted.html)
    const resStatusAccepted = await request('GET', `/api/status?applicant_id=${applicantId}`);
    assert.strictEqual(resStatusAccepted.json.status, 'accepted', 'polling reports accepted');
    console.log('✓ Test 6: GET /api/status polling returns accepted status');

    // Test 7: Register second candidate and reject via Host Command Center
    const uniqueContact2 = `@tanya_${Date.now()}`;
    const resAuth2 = await request('POST', '/api/auth', {
      name: 'Tanya Sen',
      contactType: 'instagram',
      contact: uniqueContact2,
      expectations: 'Coffee talks.',
    });
    const applicantId2 = resAuth2.json.applicant.id;
    await request('POST', '/api/apply', {
      applicantId: applicantId2,
      firstDateIdea: 'Comfort Dinner Cook-off',
      pitch: 'Love cooking!',
    });

    const resReject = await request(
      'POST',
      '/api/admin/decide',
      { applicantId: applicantId2, action: 'reject' },
      { Cookie: hostCookie }
    );
    assert.strictEqual(resReject.statusCode, 200, 'Host reject should succeed');
    assert.strictEqual(resReject.json.status, 'rejected');

    const rejectedApplicant = await db.findApplicantById(applicantId2);
    assert.strictEqual(rejectedApplicant.status, 'rejected', 'applicant status updated to rejected');

    const resStatusRejected = await request('GET', `/api/status?applicant_id=${applicantId2}`);
    assert.strictEqual(resStatusRejected.json.status, 'rejected', 'polling reports rejected');
    console.log('✓ Test 7: Host decision reject updated status to rejected in MongoDB');

    // Test 8: Verify static status pages: accepted.html with canvas confetti & direct channels
    const resAcceptedPage = await request('GET', '/accepted.html');
    assert.strictEqual(resAcceptedPage.statusCode, 200, 'GET /accepted.html should return 200');
    assert(resAcceptedPage.body.includes('confettiCanvas'), 'accepted.html contains canvas confetti');
    assert(resAcceptedPage.body.includes('ur_frnd.lee_neighbor'), 'accepted.html contains Instagram link');
    assert(resAcceptedPage.body.includes('Mokunaa'), 'accepted.html contains direct Telegram chat link');
    console.log('✓ Test 8: accepted.html verified with celebratory confetti and direct social channels');

    // Test 9: Verify rejected.html displays ERROR 404; LOVE NOT FOUND
    const resRejectedPage = await request('GET', '/rejected.html');
    assert.strictEqual(resRejectedPage.statusCode, 200, 'GET /rejected.html should return 200');
    assert(resRejectedPage.body.includes('ERROR 404;'), 'rejected.html contains ERROR 404; badge');
    assert(resRejectedPage.body.includes('LOVE') && resRejectedPage.body.includes('NOT FOUND'), 'rejected.html contains LOVE NOT FOUND');
    assert(resRejectedPage.body.includes('Back to Login Page'), 'rejected.html contains Back to Login Page button');
    console.log('✓ Test 9: rejected.html verified with ERROR 404; LOVE NOT FOUND and Back to Login button');

    console.log('\n=============================================');
    console.log('ALL PHASE 3 AUTOMATED TESTS PASSED CLEANLY! ✓');
    console.log('=============================================\n');
    process.exit(0);
  } finally {
    server.close();
  }
}

runPhase3Tests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
