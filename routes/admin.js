const express = require('express');
const router = express.Router();
const slugify = require('slugify');
const requireAdmin = require('../middleware/auth');
const {
  getAllArticles,
  getArticleById,
  createArticle,
  updateArticle,
  deleteArticle,
  getAllSubscribers,
  getStats
} = require('../database/db');

// --- Public admin routes (no auth) ---

// Login page
router.get('/login', (req, res) => {
  res.render('admin/login', { error: null });
});

// Login handler
router.post('/login', (req, res) => {
  const { password } = req.body;
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

  if (password === adminPassword) {
    req.session.isAdmin = true;
    return res.redirect('/admin');
  }

  return res.render('admin/login', { error: 'Geçersiz şifre. Lütfen tekrar deneyin.' });
});

// Logout
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

// --- Protected admin routes (require auth) ---
router.use(requireAdmin);

// Dashboard
router.get('/', (req, res) => {
  const stats = getStats();
  const recentArticles = getAllArticles(null, 5, 0);
  res.render('admin/dashboard', { stats, recentArticles });
});

// List all articles
router.get('/haberler', (req, res) => {
  const articles = getAllArticles();
  res.render('admin/articles', { articles });
});

// New article form
router.get('/haberler/yeni', (req, res) => {
  res.render('admin/editor', { article: null });
});

// Edit article form
router.get('/haberler/:id/duzenle', (req, res) => {
  const article = getArticleById(req.params.id);

  if (!article) {
    return res.redirect('/admin/haberler');
  }

  res.render('admin/editor', { article });
});

// Create or update article
router.post('/haberler', (req, res) => {
  const { id, title, excerpt, content, cover_image, social_image, category, tags, status } = req.body;

  // Generate slug from title with Turkish character support
  const slug = slugify(title, {
    lower: true,
    strict: true,
    locale: 'tr',
    remove: /[*+~.()'"!:@]/g
  });

  if (id) {
    // Update existing article
    updateArticle(id, {
      title,
      slug,
      excerpt,
      content,
      cover_image: cover_image || null,
      social_image: social_image || null,
      category: category || 'Genel',
      tags: tags || null,
      status: status || 'draft'
    });
  } else {
    // Create new article
    createArticle({
      title,
      slug,
      excerpt,
      content,
      cover_image: cover_image || null,
      social_image: social_image || null,
      category: category || 'Genel',
      tags: tags || null,
      status: status || 'draft'
    });
  }

  return res.redirect('/admin/haberler');
});

// Delete article
router.post('/haberler/:id/sil', (req, res) => {
  deleteArticle(req.params.id);
  return res.redirect('/admin/haberler');
});

// Subscribers list
router.get('/aboneler', (req, res) => {
  const subscribers = getAllSubscribers();
  res.render('admin/subscribers', { subscribers });
});

module.exports = router;
