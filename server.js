require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const { db, getAllArticles, createArticle } = require('./database/db');

// Ensure public/uploads directory exists
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const app = express();
const PORT = process.env.PORT || 3000;

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session setup
app.use(session({
  secret: process.env.SESSION_SECRET || 'europolitika-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24, // 24 hours
    httpOnly: true
  }
}));

// Mount routes
const publicRoutes = require('./routes/public');
const adminRoutes = require('./routes/admin');
const apiRoutes = require('./routes/api');

app.use('/', publicRoutes);
app.use('/admin', adminRoutes);
app.use('/api', apiRoutes);

// Seed sample article on first run if db is empty
function seedDatabase() {
  const count = db.prepare('SELECT COUNT(*) as count FROM articles').get();
  if (count.count === 0) {
    createArticle({
      title: 'EuroPolitika\'ya Hoş Geldiniz',
      slug: 'europolitikaya-hos-geldiniz',
      excerpt: 'EuroPolitika, politik ekonomi dünyasındaki en güncel gelişmeleri profesyonel gazetecilik anlayışıyla sizlere sunmak için yola çıktı.',
      content: `<p>EuroPolitika olarak, Türkiye ve dünya ekonomisindeki kritik gelişmeleri, merkez bankası kararlarını, piyasa analizlerini ve küresel politik ekonomi dinamiklerini yakından takip ediyoruz.</p>
<h2>Misyonumuz</h2>
<p>Karmaşık ekonomik ve politik gelişmeleri anlaşılır bir dille okuyucularımıza aktarmak, derinlemesine analizler sunmak ve karar alıcılara yol gösterecek içerikler üretmek temel misyonumuzdur.</p>
<h2>Neler Bulacaksınız?</h2>
<ul>
<li>Makroekonomik göstergelerin detaylı analizi</li>
<li>Merkez bankası politikalarının değerlendirilmesi</li>
<li>Küresel piyasa trendleri ve öngörüler</li>
<li>Türkiye ekonomisine dair güncel yorumlar</li>
</ul>
<p>Bizi takip etmeye devam edin ve bültenimize abone olarak en güncel içerikleri doğrudan posta kutunuza alın.</p>`,
      cover_image: null,
      category: 'Genel',
      tags: 'EuroPolitika,politik ekonomi,lansman',
      status: 'published'
    });
    console.log('✅ Veritabanına örnek makale eklendi.');
  }
}

seedDatabase();

// Start server
app.listen(PORT, () => {
  console.log(`🚀 EuroPolitika sunucusu http://localhost:${PORT} adresinde çalışıyor`);
});
