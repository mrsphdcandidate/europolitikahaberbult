const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

let dataDir = path.join(__dirname, '..', 'data');
try {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
} catch (err) {
  dataDir = '/tmp/data';
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

const dbPath = path.join(dataDir, 'europolitika.db');
const db = new Database(dbPath);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    excerpt TEXT,
    content TEXT,
    cover_image TEXT,
    social_image TEXT,
    category TEXT DEFAULT 'Genel',
    tags TEXT,
    status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'published')),
    editor_analysis TEXT,
    key_takeaways TEXT,
    views INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS subscribers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    subscribed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_active INTEGER DEFAULT 1
  );
`);

// Run migrations
try {
  db.exec('ALTER TABLE articles ADD COLUMN social_image TEXT');
} catch (e) {
  // Column already exists, ignore
}

try {
  db.exec('ALTER TABLE articles ADD COLUMN editor_analysis TEXT');
} catch (e) {
  // Column already exists, ignore
}

try {
  db.exec('ALTER TABLE articles ADD COLUMN key_takeaways TEXT');
} catch (e) {
  // Column already exists, ignore
}

// --- Article helpers ---

function getAllArticles(status = null, limit = 50, offset = 0) {
  if (status) {
    return db.prepare(
      'SELECT * FROM articles WHERE status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).all(status, limit, offset);
  }
  return db.prepare(
    'SELECT * FROM articles ORDER BY created_at DESC LIMIT ? OFFSET ?'
  ).all(limit, offset);
}

function getAllArticlesFiltered({ status = null, category = null, search = null, limit = 50, offset = 0 } = {}) {
  let sql = 'SELECT * FROM articles WHERE 1=1';
  const params = [];

  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }

  if (category && category !== 'Tümü' && category !== 'all') {
    sql += ' AND category = ?';
    params.push(category);
  }

  if (search) {
    sql += ' AND (title LIKE ? OR excerpt LIKE ? OR content LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  return db.prepare(sql).all(...params);
}

function getArticleBySlug(slug) {
  return db.prepare('SELECT * FROM articles WHERE slug = ?').get(slug);
}

function getArticleById(id) {
  return db.prepare('SELECT * FROM articles WHERE id = ?').get(id);
}

function createArticle({ title, slug, excerpt, content, cover_image, social_image, editor_analysis, key_takeaways, category, tags, status }) {
  const stmt = db.prepare(`
    INSERT INTO articles (title, slug, excerpt, content, cover_image, social_image, editor_analysis, key_takeaways, category, tags, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    title,
    slug,
    excerpt || null,
    content || null,
    cover_image || null,
    social_image || null,
    editor_analysis || null,
    key_takeaways || null,
    category || 'Genel',
    tags || null,
    status || 'draft'
  );
  return result;
}

function updateArticle(id, fields) {
  const allowedFields = ['title', 'slug', 'excerpt', 'content', 'cover_image', 'social_image', 'editor_analysis', 'key_takeaways', 'category', 'tags', 'status'];
  const setClauses = [];
  const values = [];

  for (const [key, value] of Object.entries(fields)) {
    if (allowedFields.includes(key)) {
      setClauses.push(`${key} = ?`);
      values.push(value);
    }
  }

  if (setClauses.length === 0) return null;

  setClauses.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id);

  const sql = `UPDATE articles SET ${setClauses.join(', ')} WHERE id = ?`;
  return db.prepare(sql).run(...values);
}

function deleteArticle(id) {
  return db.prepare('DELETE FROM articles WHERE id = ?').run(id);
}

function incrementViews(slug) {
  return db.prepare('UPDATE articles SET views = views + 1 WHERE slug = ?').run(slug);
}

// --- Subscriber helpers ---

function addSubscriber(email, name) {
  const stmt = db.prepare(`
    INSERT INTO subscribers (email, name) VALUES (?, ?)
  `);
  return stmt.run(email, name || null);
}

function getAllSubscribers() {
  return db.prepare('SELECT * FROM subscribers ORDER BY subscribed_at DESC').all();
}

// --- Stats ---

function getStats() {
  const totalArticles = db.prepare('SELECT COUNT(*) as count FROM articles').get().count;
  const publishedArticles = db.prepare("SELECT COUNT(*) as count FROM articles WHERE status = 'published'").get().count;
  const totalSubscribers = db.prepare('SELECT COUNT(*) as count FROM subscribers WHERE is_active = 1').get().count;
  const totalViews = db.prepare('SELECT COALESCE(SUM(views), 0) as total FROM articles').get().total;

  return { totalArticles, publishedArticles, totalSubscribers, totalViews };
}

module.exports = {
  db,
  getAllArticles,
  getAllArticlesFiltered,
  getArticleBySlug,
  getArticleById,
  createArticle,
  updateArticle,
  deleteArticle,
  incrementViews,
  addSubscriber,
  getAllSubscribers,
  getStats
};
