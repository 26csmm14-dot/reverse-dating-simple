// server.js - Pure Node.js HTTP Server for Reverse Dating Simple
require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const db = require('./db.js');
const telegram = require('./telegram.js');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.resolve(__dirname, 'public');

// MIME type map for static file streaming
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// Helper: Safely parse incoming JSON body with 5MB protection limit
function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let rawData = '';
    const MAX_SIZE = 5 * 1024 * 1024; // 5MB

    req.on('data', (chunk) => {
      rawData += chunk;
      if (rawData.length > MAX_SIZE) {
        req.destroy();
        reject(new Error('Payload too large (exceeds 5MB)'));
      }
    });

    req.on('end', () => {
      if (!rawData.trim()) return resolve({});
      try {
        const parsed = JSON.parse(rawData);
        resolve(parsed);
      } catch (err) {
        reject(new Error('Invalid JSON payload'));
      }
    });

    req.on('error', (err) => reject(err));
  });
}

// Helper: Extract cookie value by name from Cookie header
function getCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  const match = header.match(new RegExp('(^|;\\s*)(' + name + ')=([^;]*)'));
  return match ? decodeURIComponent(match[3]) : null;
}

// Helper: Send JSON response
function sendJson(res, statusCode, data, headers = {}) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    ...headers,
  });
  res.end(JSON.stringify(data));
}

// Main HTTP request router
const server = http.createServer(async (req, res) => {
  const host = req.headers.host || 'localhost:3000';
  const reqUrl = new URL(req.url, `http://${host}`);
  const pathname = reqUrl.pathname;
  const method = req.method.toUpperCase();

  // CORS preflight handling
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Cookie',
    });
    return res.end();
  }

  // -------------------------------------------------------------
  // REST API Endpoints
  // -------------------------------------------------------------

  // 1. POST /api/auth (Register or Update Candidate Profile)
  if (pathname === '/api/auth' && method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const { name, contactType, contact, photo, expectations } = body;

      if (!name || !name.trim()) {
        return sendJson(res, 400, { success: false, error: 'Full name is required.' });
      }
      if (!contact || !contact.trim()) {
        return sendJson(res, 400, { success: false, error: 'Contact handle or number is required.' });
      }

      const cleanContact = contact.trim().toLowerCase();
      let applicant = await db.findApplicantByContact(cleanContact);

      if (applicant) {
        // Update existing applicant
        applicant = await db.updateApplicant(applicant.id, {
          name: name.trim(),
          contactType: contactType || applicant.contactType || 'instagram',
          photo: photo || applicant.photo || 'default-avatar',
          expectations: expectations || applicant.expectations,
        });
      } else {
        // Create new applicant
        applicant = await db.createApplicant({
          name: name.trim(),
          contactType: contactType || 'instagram',
          contact: cleanContact,
          photo: photo || 'default-avatar',
          expectations: expectations || 'Skipped — Open to exploring the vibe organically',
        });
      }

      const applicantId = applicant.id;
      // Set session cookie
      return sendJson(
        res,
        200,
        {
          success: true,
          applicant: {
            id: applicantId,
            name: applicant.name,
            contactType: applicant.contactType,
            contact: applicant.contact,
            photo: applicant.photo,
            expectations: applicant.expectations,
            status: applicant.status,
          },
        },
        {
          'Set-Cookie': `applicant_id=${applicantId}; Path=/; SameSite=Lax; Max-Age=2592000`,
        }
      );
    } catch (err) {
      console.error('[API Auth POST Error]:', err.message);
      return sendJson(res, 500, { success: false, error: err.message });
    }
  }

  // 2. GET /api/auth (Check Current Session)
  if (pathname === '/api/auth' && method === 'GET') {
    try {
      const cookieId = getCookie(req, 'applicant_id');
      const queryId = reqUrl.searchParams.get('applicant_id');
      const activeId = cookieId || queryId;

      if (!activeId) {
        return sendJson(res, 200, { authenticated: false, applicant: null });
      }

      const applicant = await db.findApplicantById(activeId);
      if (!applicant) {
        return sendJson(res, 200, { authenticated: false, applicant: null });
      }

      return sendJson(res, 200, {
        authenticated: true,
        applicant: {
          id: applicant.id,
          name: applicant.name,
          contactType: applicant.contactType,
          contact: applicant.contact,
          photo: applicant.photo,
          expectations: applicant.expectations,
          status: applicant.status,
          firstDateIdea: applicant.firstDateIdea,
          pitch: applicant.pitch,
        },
      });
    } catch (err) {
      return sendJson(res, 500, { authenticated: false, error: err.message });
    }
  }

  // 3. DELETE /api/auth (Logout)
  if (pathname === '/api/auth' && method === 'DELETE') {
    return sendJson(
      res,
      200,
      { success: true, message: 'Logged out successfully' },
      {
        'Set-Cookie': 'applicant_id=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
      }
    );
  }

  // 4. GET /api/status (Real-time decision polling)
  if (pathname === '/api/status' && method === 'GET') {
    const cookieId = getCookie(req, 'applicant_id');
    const queryId = reqUrl.searchParams.get('applicant_id');
    const activeId = cookieId || queryId;

    if (!activeId) {
      return sendJson(res, 200, { status: 'viewing' });
    }

    const applicant = await db.findApplicantById(activeId);
    return sendJson(res, 200, {
      id: activeId,
      status: applicant ? applicant.status : 'viewing',
    });
  }

  // 5. POST /api/apply (Submit Proposal - placeholder ready for Phase 2/3)
  if (pathname === '/api/apply' && method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const cookieId = getCookie(req, 'applicant_id');
      const activeId = body.applicantId || cookieId;

      if (!activeId) {
        return sendJson(res, 401, { success: false, error: 'Unauthorized: missing applicant session' });
      }

      const updated = await db.updateApplicant(activeId, {
        status: 'pending',
        pitch: body.pitch || '',
        firstDateIdea: body.firstDateIdea || '',
        appliedAt: new Date(),
      });

      // Dispatch real-time Telegram alert to Pruthviraj with [Agree] & [Reject] buttons
      telegram.sendProposalAlert(updated).catch((err) => {
        console.warn('[Server] Telegram dispatch warning:', err.message);
      });

      return sendJson(res, 200, {
        success: true,
        applicant: updated,
        message: 'Proposal recorded and pending decision.',
      });
    } catch (err) {
      return sendJson(res, 500, { success: false, error: err.message });
    }
  }

  // -------------------------------------------------------------
  // Static File Serving from public/
  // -------------------------------------------------------------

  if (method === 'GET') {
    let relativePath = pathname === '/' ? '/index.html' : pathname;

    // Normalize and prevent directory traversal
    const safePath = path.normalize(relativePath).replace(/^(\.\.[\/\\])+/, '');
    let filePath = path.join(PUBLIC_DIR, safePath);

    // Security check: ensure filePath is inside PUBLIC_DIR
    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      return res.end('403 Forbidden: Directory traversal prevented.');
    }

    // If requesting directory, append index.html
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
      });
      const stream = fs.createReadStream(filePath);
      return stream.pipe(res);
    }

    // 404 handler for missing static assets
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(`
      <!DOCTYPE html>
      <html>
        <head><title>404 Not Found</title></head>
        <body style="background:#ffdbe6; color:#1f2937; font-family:sans-serif; text-align:center; padding:50px;">
          <h1 style="color:#db2777;">404 - Not Found</h1>
          <p>The requested file <code>${pathname}</code> was not found.</p>
          <a href="/" style="color:#db2777; font-weight:bold;">Return to Home</a>
        </body>
      </html>
    `);
  }

  // Default method not allowed
  res.writeHead(405, { 'Content-Type': 'text/plain' });
  res.end('405 Method Not Allowed');
});

// Auto-connect to database on startup if run directly
if (require.main === module) {
  db.connectDB().then(() => {
    server.listen(PORT, () => {
      console.log(`[Server] Running at http://localhost:${PORT}`);
      console.log(`[Server] Static files served from: ${PUBLIC_DIR}`);
      // Start background decision listener for Telegram bot button clicks
      telegram.startPolling(db);
    });
  });
}

module.exports = server;
