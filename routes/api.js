const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const urlModule = require('url');
const { processContent } = require('../services/groq');
const { scrapeUrl } = require('../services/scraper');

// Multer storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '..', 'public', 'uploads'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, uniqueSuffix + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp|svg/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Sadece resim dosyaları yüklenebilir (jpeg, jpg, png, gif, webp, svg).'));
  }
});

// Helper to follow redirect and get final static image URL
async function resolveStaticImageUrl(url) {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return response.url;
  } catch (error) {
    console.error('Görsel URL çözümleme hatası:', error.message);
    return url; // fallback to original dynamic URL
  }
}

// Helper to replace all loremflickr dynamic links inside HTML content with static ones
async function resolveInlineImages(htmlContent) {
  if (!htmlContent) return htmlContent;
  
  const regex = /src="(https:\/\/loremflickr\.com\/[^"]+)"/g;
  let match;
  const urls = [];
  
  while ((match = regex.exec(htmlContent)) !== null) {
    urls.push(match[1]);
  }
  
  let resolvedHtml = htmlContent;
  for (const url of urls) {
    console.log(`[Image Resolver] Raporlanan dinamik görsel çözümleniyor: ${url}`);
    const staticUrl = await resolveStaticImageUrl(url);
    resolvedHtml = resolvedHtml.replace(url, staticUrl);
  }
  
  return resolvedHtml;
}

// AI content processing endpoint
router.post('/ai/process', async (req, res) => {
  const { content } = req.body;

  if (!content || content.trim().length === 0) {
    return res.status(400).json({ success: false, message: 'İçerik boş olamaz.' });
  }

  const rawInput = content.trim();
  const isUrl = rawInput.startsWith('http://') || rawInput.startsWith('https://');

  try {
    let textToProcess = rawInput;

    if (isUrl) {
      console.log(`[Scraper] URL algılandı. İçerik çekiliyor: ${rawInput}`);
      const scraped = await scrapeUrl(rawInput);
      if (!scraped.text || scraped.text.length < 50) {
        throw new Error('Web sayfasından anlamlı bir metin içeriği çekilemedi. Lütfen ham metni kopyalayıp yapıştırın.');
      }
      textToProcess = `Kaynak Başlığı: ${scraped.title}\n\nKaynak İçeriği:\n${scraped.text}`;
    }

    console.log('[AI] Groq ile içerik işleniyor...');
    const result = await processContent(textToProcess);

    // Resolve cover image from image_keywords
    if (result.image_keywords) {
      const keywordList = result.image_keywords.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
      let primaryKeyword = keywordList[0] || 'finance';
      primaryKeyword = primaryKeyword.replace(/[^a-z0-9]/g, '');
      
      const dynamicCoverUrl = `https://loremflickr.com/800/600/${primaryKeyword}`;
      console.log(`[Image Resolver] Kapak görseli çözümleniyor: ${dynamicCoverUrl}`);
      result.cover_image = await resolveStaticImageUrl(dynamicCoverUrl);
    } else {
      result.cover_image = null;
    }
    
    // Resolve inline images inside content
    if (result.content) {
      result.content = await resolveInlineImages(result.content);
    }

    return res.json({ success: true, data: result });
  } catch (error) {
    console.error('AI işleme hatası:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Image upload endpoint
router.post('/upload', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'Dosya yüklenemedi.' });
  }

  const url = '/uploads/' + req.file.filename;
  return res.json({ success: true, url });
});

// Image download from URL endpoint
router.post('/upload-url', async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ success: false, message: 'URL adresi boş olamaz.' });
  }

  try {
    const parsedUrl = urlModule.parse(url);
    const filename = path.basename(parsedUrl.pathname) || 'downloaded-image.jpg';
    
    // Create a safe unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const safeExt = path.extname(filename) || '.jpg';
    const localFilename = uniqueSuffix + safeExt;
    const localPath = path.join(__dirname, '..', 'public', 'uploads', localFilename);

    console.log(`[Downloader] Görsel indiriliyor: ${url} -> ${localPath}`);

    // Download file helper supporting redirects
    const download = (targetUrl) => {
      return new Promise((resolve, reject) => {
        const client = targetUrl.startsWith('https') ? https : http;
        client.get(targetUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
            'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
            'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
            'Referer': 'https://google.com'
          }
        }, (response) => {
          if (response.statusCode === 301 || response.statusCode === 302) {
            // Follow redirect
            resolve(download(response.headers.location));
            return;
          }

          if (response.statusCode !== 200) {
            reject(new Error(`HTTP Durum Kodu: ${response.statusCode}`));
            return;
          }

          const fileStream = fs.createWriteStream(localPath);
          response.pipe(fileStream);
          fileStream.on('finish', () => {
            fileStream.close();
            resolve();
          });
        }).on('error', (err) => {
          fs.unlink(localPath, () => {}); // delete partial file
          reject(err);
        });
      });
    };

    await download(url);
    
    const localUrl = '/uploads/' + localFilename;
    return res.json({ success: true, url: localUrl });

  } catch (error) {
    console.error('Görsel indirme hatası:', error.message);
    return res.status(500).json({ success: false, message: `Görsel indirilemedi: ${error.message}` });
  }
});

module.exports = router;
