// test-phase3.js - Automated Verification Suite for Phase 3 (Telegram & Status Transitions)
const http = require('http');
const assert = require('assert');
const server = require('./server.js');
const db = require('./db.js');
const telegram = require('./telegram.js');

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
    // Test 1: Telegram Bot Configuration & Credentials
    assert(telegram.BOT_TOKEN && telegram.BOT_TOKEN.includes(':'), 'Valid Telegram Bot Token present');
    assert(telegram.CHAT_ID && telegram.CHAT_ID.length > 3, 'Valid Telegram Chat ID present');
    console.log(`✓ Test 1: Telegram configuration verified (Chat ID: ${telegram.CHAT_ID})`);

    // Test 2: Telegram Proposal Alert Formatting & Strict 2-Button Keyboard
    const sampleApplicant = {
      id: 'test_cand_123',
      name: 'Maya Lin',
      contactType: 'instagram',
      contact: '@mayalin_official',
      expectations: 'Deep late night conversations and chai',
      firstDateIdea: 'Comfort Dinner Cook-off',
      pitch: 'I make the best penne pasta you will ever taste!',
    };

    const caption = telegram.formatProposalCaption(sampleApplicant);
    assert(caption.includes('NEW WANNA DATE U PROPOSAL'), 'Caption includes header');
    assert(caption.includes('Maya Lin'), 'Caption includes candidate name');
    assert(caption.includes('@mayalin_official'), 'Caption includes handle');
    assert(caption.includes('Comfort Dinner Cook-off'), 'Caption includes date idea');
    assert(caption.includes('penne pasta'), 'Caption includes pitch note');

    const keyboard = telegram.getDecisionKeyboard(sampleApplicant.id);
    assert.strictEqual(keyboard.inline_keyboard.length, 1, 'Keyboard has exactly 1 row');
    assert.strictEqual(keyboard.inline_keyboard[0].length, 2, 'Row has exactly 2 decision buttons');
    assert.strictEqual(keyboard.inline_keyboard[0][0].text, 'Agree (Accept)');
    assert.strictEqual(keyboard.inline_keyboard[0][0].callback_data, 'accept:test_cand_123');
    assert.strictEqual(keyboard.inline_keyboard[0][1].text, 'Reject (404)');
    assert.strictEqual(keyboard.inline_keyboard[0][1].callback_data, 'reject:test_cand_123');
    console.log('✓ Test 2: Telegram caption formatting & 2 inline decision buttons verified');

    // Test 3: Candidate Registration via POST /api/auth
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
    console.log('✓ Test 3: Candidate registration with status viewing verified');

    // Test 4: Proposal Submission via POST /api/apply
    const proposalPayload = {
      applicantId: applicantId,
      firstDateIdea: 'Scenic Mountain Trail Trek & Hilltop Sunset',
      pitch: 'Let us hike up the hills and watch the sunset together.',
    };
    const resApply = await request('POST', '/api/apply', proposalPayload);
    assert.strictEqual(resApply.statusCode, 200, 'POST /api/apply should succeed');
    assert.strictEqual(resApply.json.applicant.status, 'pending', 'status updated to pending');
    console.log('✓ Test 4: Proposal submission via POST /api/apply updated status to pending');

    // Test 5: Client Polling via GET /api/status returns pending (STATUS-01)
    const resStatusPending = await request('GET', `/api/status?applicant_id=${applicantId}`);
    assert.strictEqual(resStatusPending.statusCode, 200);
    assert.strictEqual(resStatusPending.json.status, 'pending', 'polling reports pending');
    console.log('✓ Test 5: GET /api/status polling returns pending status');

    // Test 6: Simulate Telegram [Agree (Accept)] callback query (NOTIF-04)
    const acceptQuery = {
      id: 'query_accept_test_1',
      data: `accept:${applicantId}`,
      message: {
        chat: { id: telegram.CHAT_ID },
        message_id: 9999,
        text: caption,
      },
    };
    await telegram.handleCallbackQuery(acceptQuery, db);

    // Verify applicant in MongoDB is now accepted
    const acceptedApplicant = await db.findApplicantById(applicantId);
    assert.strictEqual(acceptedApplicant.status, 'accepted', 'applicant status updated to accepted');
    console.log('✓ Test 6: Telegram callback query accept updated status to accepted in MongoDB');

    // Test 7: Verify GET /api/status now reports accepted (triggers redirect to accepted.html)
    const resStatusAccepted = await request('GET', `/api/status?applicant_id=${applicantId}`);
    assert.strictEqual(resStatusAccepted.json.status, 'accepted', 'polling reports accepted');
    console.log('✓ Test 7: GET /api/status polling returns accepted status');

    // Test 8: Simulate Telegram [Reject (404)] callback query on second applicant
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

    const rejectQuery = {
      id: 'query_reject_test_2',
      data: `reject:${applicantId2}`,
      message: {
        chat: { id: telegram.CHAT_ID },
        message_id: 9998,
        text: caption,
      },
    };
    await telegram.handleCallbackQuery(rejectQuery, db);

    const rejectedApplicant = await db.findApplicantById(applicantId2);
    assert.strictEqual(rejectedApplicant.status, 'rejected', 'applicant status updated to rejected');

    const resStatusRejected = await request('GET', `/api/status?applicant_id=${applicantId2}`);
    assert.strictEqual(resStatusRejected.json.status, 'rejected', 'polling reports rejected');
    console.log('✓ Test 8: Telegram callback query reject updated status to rejected in MongoDB');

    // Test 9: Verify static status pages: accepted.html with canvas confetti & rejected.html
    const resAcceptedPage = await request('GET', '/accepted.html');
    assert.strictEqual(resAcceptedPage.statusCode, 200, 'GET /accepted.html should return 200');
    assert(resAcceptedPage.body.includes('confettiCanvas'), 'accepted.html contains canvas confetti');
    assert(resAcceptedPage.body.includes('ur_frnd.lee_neighbor'), 'accepted.html contains Instagram link');
    assert(resAcceptedPage.body.includes('Mokunaa'), 'accepted.html contains Telegram link');

    const resRejectedPage = await request('GET', '/rejected.html');
    assert.strictEqual(resRejectedPage.statusCode, 200, 'GET /rejected.html should return 200');
    assert(resRejectedPage.body.includes('Connection Not Found'), 'rejected.html contains playful 404 message');
    console.log('✓ Test 9: accepted.html (confetti & channels) & rejected.html verified');

    console.log('\n=============================================');
    console.log('ALL PHASE 3 AUTOMATED TESTS PASSED CLEANLY! ✓');
    console.log('=============================================\n');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Phase 3 test suite failed:', err);
    process.exit(1);
  }
}

runPhase3Tests();
