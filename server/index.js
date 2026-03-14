const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { initDb, registerEmail, logOpen, getAllEmails, getStats, getExcludedIps, addExcludedIp, removeExcludedIp } = require('./db');
const { parseEmailClient } = require('./ua-parser');

const PORT = process.env.PORT || 3000;
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'tracker.db');

if (!DASHBOARD_PASSWORD) {
  console.error('DASHBOARD_PASSWORD environment variable is required');
  process.exit(1);
}

initDb(DB_PATH);

const app = express();

app.use((req, res, next) => {
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-dashboard-password'
  });
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json());

const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

function checkPassword(req, res, next) {
  const provided = req.headers['x-dashboard-password'] || '';
  if (typeof provided !== 'string' || provided.length === 0) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const a = Buffer.from(provided);
  const b = Buffer.from(DASHBOARD_PASSWORD);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// Tracking pixel
app.get('/t/:emailId', (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;
  const ua = req.headers['user-agent'] || '';

  try {
    logOpen(req.params.emailId, ip, ua);
  } catch (err) {
    // Email ID may not exist yet — log anyway is not possible due to FK,
    // so silently ignore unknown email IDs
  }

  res.set({
    'Content-Type': 'image/gif',
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  res.send(TRANSPARENT_GIF);
});

// Register email
app.post('/register', checkPassword, (req, res) => {
  const { id, subject, recipient } = req.body;
  if (!id || !subject || !recipient) {
    return res.status(400).json({ error: 'Missing required fields: id, subject, recipient' });
  }
  try {
    registerEmail(id, subject, recipient);
    res.json({ success: true });
  } catch (err) {
    res.status(409).json({ error: 'Email ID already exists' });
  }
});

// API: get all emails + stats
app.get('/api/emails', checkPassword, (req, res) => {
  const emails = getAllEmails().map(email => ({
    ...email,
    opens: email.opens.map(open => ({
      ...open,
      client: parseEmailClient(open.user_agent)
    }))
  }));
  const stats = getStats();
  res.json({ emails, stats });
});

// Excluded IPs
app.get('/api/excluded-ips', checkPassword, (req, res) => {
  res.json({ ips: getExcludedIps() });
});

app.post('/api/excluded-ips', checkPassword, (req, res) => {
  const { ip, label } = req.body;
  if (!ip) return res.status(400).json({ error: 'Missing required field: ip' });
  addExcludedIp(ip.trim(), label || '');
  res.json({ success: true });
});

app.delete('/api/excluded-ips', checkPassword, (req, res) => {
  const { ip } = req.body;
  if (!ip) return res.status(400).json({ error: 'Missing required field: ip' });
  removeExcludedIp(ip.trim());
  res.json({ success: true });
});

// Return requester's IP (for "Add my IP" button)
app.get('/api/my-ip', checkPassword, (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;
  res.json({ ip });
});

// Dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.listen(PORT, () => {
  console.log(`Tracker server running on port ${PORT}`);
});
