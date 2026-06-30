const express = require('express');
const router = express.Router();
const { getAllArticles, getArticleBySlug, incrementViews, addSubscriber, getStats } = require('../database/db');

// Home page
router.get('/', (req, res) => {
  const articles = getAllArticles('published', 12, 0);
  const stats = getStats();
  res.render('public/home', { articles, stats });
});

// Single article page
router.get('/haber/:slug', (req, res) => {
  const article = getArticleBySlug(req.params.slug);

  if (!article) {
    return res.status(404).render('public/home', {
      articles: getAllArticles('published', 12, 0),
      stats: getStats(),
      error: 'Makale bulunamadı.'
    });
  }

  // Increment view count
  incrementViews(req.params.slug);

  // Get recent articles for sidebar
  const recentArticles = getAllArticles('published', 4, 0);

  res.render('public/article', { article, recentArticles });
});

// Newsletter subscription
router.post('/abone-ol', (req, res) => {
  const { email, name } = req.body;

  if (!email) {
    return res.status(400).json({ success: false, message: 'E-posta adresi gereklidir.' });
  }

  try {
    addSubscriber(email, name);
    return res.json({ success: true, message: 'Bültenimize başarıyla abone oldunuz!' });
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ success: false, message: 'Bu e-posta adresi zaten kayıtlı.' });
    }
    console.error('Abone ekleme hatası:', error.message);
    return res.status(500).json({ success: false, message: 'Bir hata oluştu. Lütfen tekrar deneyin.' });
  }
});

module.exports = router;
