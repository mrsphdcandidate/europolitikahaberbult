require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const { db, getAllArticles, createArticle } = require('./database/db');

// Ensure data/uploads directory exists
let uploadsDir = path.join(__dirname, 'data', 'uploads');
try {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
} catch (err) {
  uploadsDir = '/tmp/data/uploads';
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
}

const app = express();
const PORT = process.env.PORT || 3000;

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

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
  
  const title = 'EuroPolitika: Yeni Nesil Politik Ekonomi Bülteni Yayında!';
  const slug = 'europolitika-yeni-nesil-politik-ekonomi-bulteni-yayinda';
  const excerpt = 'Küresel piyasaları, makroekonomik gelişmeleri ve jeopolitik gelişmeleri yapay zeka gücüyle harmanlayan EuroPolitika yayına başladı.';
  const content = `<p>Gelişen teknoloji ve yapay zeka devrimi, medya ve gazetecilik dünyasını da kökten dönüştürüyor. Bu yeni çağın en dinamik temsilcilerinden biri olarak yola çıkan <strong>EuroPolitika</strong>, küresel finansal piyasaları, makroekonomik trendleri ve jeopolitik gelişmeleri en doğru ve anlaşılır analizlerle okuyucularına sunmak amacıyla yayın hayatına başladı.</p>

<p>EuroPolitika, klasik haber sitelerinin karmaşasından uzak, tamamen <strong>editorial bülten (newsletter)</strong> kültüründen esinlenerek tasarlandı. Temiz okuma deneyimi, gelişmiş veri panelleri ve akıllı içerik derleyicileri ile hem bireysel yatırımcılara hem de derinlemesine analiz arayan profesyonellere hitap ediyor.</p>

<h2>Yapay Zeka Destekli Editörlük Süreci</h2>
<p>EuroPolitika\'nın arkasında, en son yapay zeka dil modelleri ve gelişmiş içerik analiz araçları yer alıyor. Farklı dillerdeki ve kaynaklardaki karmaşık ekonomi verileri ile haber akışları, gelişmiş <strong>Groq AI entegrasyonu</strong> sayesinde saniyeler içinde analiz edilip profesyonel bir gazetecilik Türkçe\'si ile yeniden kaleme alınıyor.</p>

<img class="image-placeholder" data-id="1" data-prompt="Modern financial analysis workspace with multiples screens showing stock charts and economic data" data-search="financial workspace data analysis screen chart">

<h2>Tek Tıkla Bülten (Digest) Derleme</h2>
<p>Yatırımcılarına veya müşterilerine bülten hazırlayan profesyoneller için EuroPolitika, benzersiz bir <strong>"Bülten Oluşturucu"</strong> sunuyor. Editörler, birden fazla haber linkini sisteme girdiklerinde, yapay zeka bu haberleri tek bir bülten makalesi olarak birleştiriyor, kaynaklarını otomatik olarak analiz edip (BBC, Reuters, Bloomberg vb.) metne ekliyor ve görsellerini yerel olarak optimize ederek yayına hazırlıyor.</p>

<h2>Canlı Finans ve Endeks Verileri</h2>
<p>Haber akışının yanı sıra platform, küresel piyasaların nabzını tutuyor. Sitede yer alan dinamik finans paneli sayesinde <strong>BIST 100, Nasdaq, S&P 500, Alman DAX, İngiliz FTSE</strong> endeksleri ve <strong>EUR/USD, Dolar/TL</strong> pariteleri gibi en temel piyasa göstergeleri Yahoo Finance üzerinden canlı verilerle sunuluyor.</p>

<p>Haftalık bültenlerimize ücretsiz abone olarak politik ekonomi dünyasının en kritik gelişmelerini doğrudan posta kutunuzda bulabilirsiniz.</p>`;

  if (count.count === 0) {
    createArticle({
      title,
      slug,
      excerpt,
      content,
      cover_image: '/uploads/intro-cover.jpg',
      category: 'Genel',
      tags: 'EuroPolitika,politik ekonomi,bülten,yapay zeka',
      status: 'published'
    });
    console.log('✅ Veritabanına örnek tanıtım makalesi eklendi.');
  } else {
    const firstArticle = db.prepare('SELECT id, title FROM articles WHERE id = 1').get();
    if (firstArticle && (firstArticle.title === "EuroPolitika'ya Hoş Geldiniz" || firstArticle.title === "EuroPolitika\'ya Hoş Geldiniz")) {
      db.prepare('UPDATE articles SET title = ?, slug = ?, excerpt = ?, content = ?, tags = ?, category = ?, status = ? WHERE id = 1')
        .run(title, slug, excerpt, content, 'EuroPolitika,politik ekonomi,bülten,yapay zeka', 'Genel', 'published');
      console.log('✅ Örnek tanıtım makalesi güncellendi.');
    }
  }

  // Ensure default cover image exists in persistent directory
  const defaultCoverPath = path.join(uploadsDir, 'intro-cover.jpg');
  if (!fs.existsSync(defaultCoverPath)) {
    const https = require('https');
    const file = fs.createWriteStream(defaultCoverPath);
    https.get('https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&w=1200&q=80', (response) => {
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        console.log('✅ Default cover image downloaded successfully.');
        db.prepare('UPDATE articles SET cover_image = ? WHERE id = 1').run('/uploads/intro-cover.jpg');
      });
    }).on('error', (err) => {
      fs.unlink(defaultCoverPath, () => {});
      console.error('Failed to download default cover:', err.message);
    });
  }
}

seedDatabase();

// Start server
app.listen(PORT, () => {
  console.log(`🚀 EuroPolitika sunucusu http://localhost:${PORT} adresinde çalışıyor`);
});
