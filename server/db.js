const Database = require('better-sqlite3');

let db;

function initDb(dbPath = ':memory:') {
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS emails (
      id TEXT PRIMARY KEY,
      subject TEXT,
      recipient TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS opens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email_id TEXT NOT NULL REFERENCES emails(id),
      opened_at TEXT DEFAULT (datetime('now')),
      ip TEXT,
      user_agent TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_opens_email_id ON opens(email_id);

    CREATE TABLE IF NOT EXISTS excluded_ips (
      ip TEXT PRIMARY KEY,
      label TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  return db;
}

function registerEmail(id, subject, recipient) {
  const stmt = db.prepare('INSERT INTO emails (id, subject, recipient) VALUES (?, ?, ?)');
  stmt.run(id, subject, recipient);
}

function isExcludedIp(ip) {
  const row = db.prepare('SELECT 1 FROM excluded_ips WHERE ip = ?').get(ip);
  return !!row;
}

function logOpen(emailId, ip, userAgent) {
  if (isExcludedIp(ip)) return false;
  const stmt = db.prepare('INSERT INTO opens (email_id, ip, user_agent) VALUES (?, ?, ?)');
  stmt.run(emailId, ip, userAgent);
  return true;
}

function getAllEmails() {
  const emails = db.prepare('SELECT * FROM emails ORDER BY created_at DESC').all();
  const opens = db.prepare('SELECT * FROM opens ORDER BY opened_at DESC').all();

  const opensByEmail = {};
  for (const open of opens) {
    if (!opensByEmail[open.email_id]) opensByEmail[open.email_id] = [];
    opensByEmail[open.email_id].push(open);
  }

  return emails.map(email => ({
    ...email,
    opens: opensByEmail[email.id] || []
  }));
}

function getStats() {
  const totalEmails = db.prepare('SELECT COUNT(*) as count FROM emails').get().count;
  const totalOpens = db.prepare('SELECT COUNT(*) as count FROM opens').get().count;
  const uniqueOpened = db.prepare('SELECT COUNT(DISTINCT email_id) as count FROM opens').get().count;
  return {
    totalEmails,
    totalOpens,
    uniqueOpened,
    openRate: totalEmails > 0 ? Math.round((uniqueOpened / totalEmails) * 100) : 0
  };
}

function getExcludedIps() {
  return db.prepare('SELECT * FROM excluded_ips ORDER BY created_at DESC').all();
}

function addExcludedIp(ip, label) {
  db.prepare('INSERT OR IGNORE INTO excluded_ips (ip, label) VALUES (?, ?)').run(ip, label || '');
}

function removeExcludedIp(ip) {
  db.prepare('DELETE FROM excluded_ips WHERE ip = ?').run(ip);
}

function getEmailStatuses() {
  return db.prepare(`
    SELECT e.id, e.subject, e.recipient,
      CASE WHEN COUNT(o.id) > 0 THEN 1 ELSE 0 END as opened
    FROM emails e
    LEFT JOIN opens o ON o.email_id = e.id
    GROUP BY e.id
    ORDER BY e.created_at DESC
  `).all();
}

module.exports = { initDb, registerEmail, logOpen, getAllEmails, getStats, getExcludedIps, addExcludedIp, removeExcludedIp, getEmailStatuses };
