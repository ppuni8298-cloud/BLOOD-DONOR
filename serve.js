/**
 * BLOODLINK - LOCAL PREVIEW HTTP SERVER (serve.js)
 * Lightweight development server for local testing and demonstration.
 * Run with: node serve.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  let cleanUrl = req.url.split('?')[0];
  if (cleanUrl === '/' || cleanUrl === '') {
    cleanUrl = '/index.html';
  }

  let filePath = path.join(__dirname, cleanUrl);

  // Clean URL support: if no extension and file does not exist, check with .html
  if (!path.extname(cleanUrl) && !fs.existsSync(filePath) && fs.existsSync(filePath + '.html')) {
    filePath = filePath + '.html';
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found - BloodLink Development Server');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'SAMEORIGIN'
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`\n===============================================================`);
  console.log(`🩸 BLOODLINK - INTELLIGENT BLOOD DONATION & EMERGENCY NETWORK`);
  console.log(`   Healthcare Technology Platform & Emergency Portal`);
  console.log(`===============================================================`);
  console.log(` Local Server running at: http://localhost:${PORT}`);
  console.log(`   - Home & 3D Scene:     http://localhost:${PORT}/index.html`);
  console.log(`   - Authentication UI:   http://localhost:${PORT}/auth.html`);
  console.log(`   - Find Blood Portal:   http://localhost:${PORT}/find-blood.html`);
  console.log(`===============================================================\n`);
});
