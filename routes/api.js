const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const urlModule = require('url');
const { processContent, processNewsletterContent } = require('../services/groq');
const { scrapeUrl } = require('../services/scraper');
const sharp = require('sharp');

// Multer storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '..', 'data', 'uploads'));
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

// Helper to download an image from a URL and save it locally in WebP format
async function downloadAndSaveAsWebP(targetUrl) {
  try {
    const parsedUrl = urlModule.parse(targetUrl);
    const filename = path.basename(parsedUrl.pathname) || 'downloaded-image.jpg';
    
    // Create a safe unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const safeExt = path.extname(filename) || '.jpg';
    const localFilename = uniqueSuffix + safeExt;
    const localPath = path.join(__dirname, '..', 'data', 'uploads', localFilename);

    console.log(`[Downloader Helper] Görsel indiriliyor: ${targetUrl} -> ${localPath}`);

    const downloadPromise = () => new Promise((resolve, reject) => {
      const client = targetUrl.startsWith('https') ? https : http;
      client.get(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
          'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          'Referer': 'https://google.com'
        }
      }, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          // Follow redirect
          resolve(downloadAndSaveAsWebP(response.headers.location));
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
          resolve(localPath);
        });
      }).on('error', (err) => {
        fs.unlink(localPath, () => {}); // delete partial file
        reject(err);
      });
    });

    const downloadedPath = await downloadPromise();
    // Convert to webp using our existing convertToWebP helper
    return await convertToWebP(downloadedPath);
  } catch (error) {
    console.error('downloadAndSaveAsWebP error:', error.message);
    return null;
  }
}

// Helper to replace all loremflickr dynamic links inside HTML content with static locally saved ones
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
    console.log(`[Image Resolver] Raporlanan dinamik görsel çözümleniyor ve yerelleştiriliyor: ${url}`);
    const staticUrl = await resolveStaticImageUrl(url);
    const localUrl = await downloadAndSaveAsWebP(staticUrl);
    if (localUrl) {
      resolvedHtml = resolvedHtml.replace(url, localUrl);
    }
  }
  
  return resolvedHtml;
}

// Helper to prepare image placeholders for CKEditor by transforming them into valid <img> tags with a spacer src
function preparePlaceholdersForEditor(htmlContent) {
  if (!htmlContent) return htmlContent;
  
  // 1. Convert <div class="image-placeholder" ...></div> to <img class="image-placeholder" ...>
  let processed = htmlContent.replace(
    /<div\s+class="image-placeholder"([^>]*)><\/div>/gi,
    '<img class="image-placeholder" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"$1>'
  );

  // 2. Make sure any existing <img class="image-placeholder" ...> tags have the spacer src
  processed = processed.replace(
    /<img\s+class="image-placeholder"([^>]*)/gi,
    (match) => {
      if (!match.includes('src=')) {
        return match.replace(
          /<img\s+class="image-placeholder"/gi,
          '<img class="image-placeholder" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"'
        );
      }
      return match;
    }
  );

  return processed;
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
    let scraped = null;

    if (isUrl) {
      console.log(`[Scraper] URL algılandı. İçerik çekiliyor: ${rawInput}`);
      scraped = await scrapeUrl(rawInput);
      if (!scraped.text || scraped.text.length < 50) {
        throw new Error('Web sayfasından anlamlı bir metin içeriği çekilemedi. Lütfen ham metni kopyalayıp yapıştırın.');
      }
      textToProcess = `Kaynak Başlığı: ${scraped.title}\n\nKaynak İçeriği:\n${scraped.text}`;
    }

    console.log('[AI] Groq ile içerik işleniyor...');
    const result = await processContent(textToProcess);

    // Resolve cover image from the scraped article metadata if available (avoid random fallbacks)
    if (scraped && scraped.cover_image) {
      console.log(`[Image Resolver] Kaynak sayfadan çekilen kapak görseli yerelleştiriliyor: ${scraped.cover_image}`);
      result.cover_image = await downloadAndSaveAsWebP(scraped.cover_image);
    } else {
      result.cover_image = null;
    }
    
    // Resolve inline images inside content
    if (result.content) {
      result.content = await resolveInlineImages(result.content);
      result.content = preparePlaceholdersForEditor(result.content);
    }

    return res.json({ success: true, data: result });
  } catch (error) {
    console.error('AI işleme hatası:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Helper to extract clean source name from URL
function getDomainSourceName(url) {
  try {
    const parsed = urlModule.parse(url);
    let host = parsed.hostname || '';
    host = host.replace(/^www\./i, '');
    const parts = host.split('.');
    let name = parts[0] || 'Kaynak';
    
    const mapping = {
      'bbc': 'BBC',
      'reuters': 'Reuters',
      'bloomberg': 'Bloomberg',
      'dw': 'DW',
      'nytimes': 'NYT',
      'euronews': 'Euronews',
      'aljazeera': 'Al Jazeera',
      'ft': 'Financial Times',
      'economist': 'The Economist',
      'cnbc': 'CNBC'
    };
    
    const lowerName = name.toLowerCase();
    if (mapping[lowerName]) {
      return mapping[lowerName];
    }
    
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch (e) {
    return 'Kaynak';
  }
}

// Helper to create a grid/collage image of up to 7 images
async function createCollage(imagePaths) {
  if (!imagePaths || imagePaths.length === 0) return null;
  
  // Filter out empty entries and map to absolute local paths
  const absolutePaths = imagePaths
    .filter(Boolean)
    .map(p => {
      if (path.isAbsolute(p)) return p;
      const baseName = path.basename(p);
      return path.join(__dirname, '..', 'data', 'uploads', baseName);
    })
    .filter(p => fs.existsSync(p));

  if (absolutePaths.length === 0) return null;
  
  const paths = absolutePaths.slice(0, 7);
  const numImages = paths.length;
  
  const filename = `collage-${Date.now()}-${Math.round(Math.random() * 1E9)}.webp`;
  const destPath = path.join(__dirname, '..', 'data', 'uploads', filename);

  try {
    // If only 1 image, crop it to standard 1200x600 px for nice cover fit
    if (numImages === 1) {
      await sharp(paths[0])
        .resize(1200, 600, { fit: 'cover' })
        .webp({ quality: 85 })
        .toFile(destPath);
      return '/uploads/' + filename;
    }

    const canvasWidth = 1200;
    const canvasHeight = 600;
    const gap = 6; // gap width in pixels
    
    // Create dark base canvas background
    const base = sharp({
      create: {
        width: canvasWidth,
        height: canvasHeight,
        channels: 4,
        background: { r: 26, g: 26, b: 26, alpha: 1 } // #1A1A1A
      }
    });
    
    const composites = [];
    let regions = [];
    
    if (numImages === 2) {
      const w = Math.floor((canvasWidth - gap) / 2);
      regions = [
        { left: 0, top: 0, width: w, height: 600 },
        { left: w + gap, top: 0, width: w, height: 600 }
      ];
    } else if (numImages === 3) {
      const w1 = Math.floor((canvasWidth - gap) / 2);
      const w2 = canvasWidth - gap - w1;
      const h = Math.floor((canvasHeight - gap) / 2);
      regions = [
        { left: 0, top: 0, width: w1, height: 600 },
        { left: w1 + gap, top: 0, width: w2, height: h },
        { left: w1 + gap, top: h + gap, width: w2, height: h }
      ];
    } else if (numImages === 4) {
      const w = Math.floor((canvasWidth - gap) / 2);
      const h = Math.floor((canvasHeight - gap) / 2);
      regions = [
        { left: 0, top: 0, width: w, height: h },
        { left: w + gap, top: 0, width: w, height: h },
        { left: 0, top: h + gap, width: w, height: h },
        { left: w + gap, top: h + gap, width: w, height: h }
      ];
    } else if (numImages === 5) {
      const w1 = Math.floor((canvasWidth - gap) / 2);
      const w2 = Math.floor((w1 - gap) / 2);
      const h = Math.floor((canvasHeight - gap) / 2);
      regions = [
        { left: 0, top: 0, width: w1, height: 600 },
        { left: w1 + gap, top: 0, width: w2, height: h },
        { left: w1 + gap + w2 + gap, top: 0, width: w2, height: h },
        { left: w1 + gap, top: h + gap, width: w2, height: h },
        { left: w1 + gap + w2 + gap, top: h + gap, width: w2, height: h }
      ];
    } else if (numImages === 6) {
      const w = Math.floor((canvasWidth - 2 * gap) / 3);
      const h = Math.floor((canvasHeight - gap) / 2);
      regions = [
        { left: 0, top: 0, width: w, height: h },
        { left: w + gap, top: 0, width: w, height: h },
        { left: 2 * (w + gap), top: 0, width: w, height: h },
        { left: 0, top: h + gap, width: w, height: h },
        { left: w + gap, top: h + gap, width: w, height: h },
        { left: 2 * (w + gap), top: h + gap, width: w, height: h }
      ];
    } else { // 7 images
      const w1 = Math.floor((canvasWidth - gap) / 2);
      const w2 = Math.floor((w1 - 2 * gap) / 3);
      const h = Math.floor((canvasHeight - gap) / 2);
      regions = [
        { left: 0, top: 0, width: w1, height: 600 },
        { left: w1 + gap, top: 0, width: w2, height: h },
        { left: w1 + gap + w2 + gap, top: 0, width: w2, height: h },
        { left: w1 + gap + 2 * (w2 + gap), top: 0, width: w2, height: h },
        { left: w1 + gap, top: h + gap, width: w2, height: h },
        { left: w1 + gap + w2 + gap, top: h + gap, width: w2, height: h },
        { left: w1 + gap + 2 * (w2 + gap), top: h + gap, width: w2, height: h }
      ];
    }
    
    for (let i = 0; i < numImages; i++) {
      const reg = regions[i];
      const imgBuffer = await sharp(paths[i])
        .resize(reg.width, reg.height, { fit: 'cover' })
        .toBuffer();
        
      composites.push({
        input: imgBuffer,
        left: reg.left,
        top: reg.top
      });
    }
    
    await base.composite(composites).webp({ quality: 80 }).toFile(destPath);
    console.log(`[Collage Generator] Kolaj oluşturuldu (${numImages} resim): ${destPath}`);
    return '/uploads/' + filename;
  } catch (error) {
    console.error('Collage creation failed:', error.message);
    return imagePaths[0]; // Fallback to first image path if collage fails
  }
}

// AI newsletter processing endpoint (compiles multiple URLs or raw texts)
router.post('/ai/process-newsletter', async (req, res) => {
  const { items, urls } = req.body;

  // Map legacy urls payload to hybrid items structure if needed
  let activeItems = [];
  if (items && Array.isArray(items)) {
    activeItems = items;
  } else if (urls && Array.isArray(urls)) {
    activeItems = urls.map(u => ({ type: 'url', value: u }));
  }

  const validItems = activeItems.filter(item => item && item.value && item.value.trim().length > 0);
  if (validItems.length === 0) {
    return res.status(400).json({ success: false, message: 'En az bir haber linki veya yazısı girilmelidir.' });
  }

  console.log(`[Newsletter Compiler] ${validItems.length} adet bülten girdisi işleniyor...`);

  try {
    const processedStories = [];
    const scrapedImages = []; // will store resolved image data for placeholders
    const collageImagePaths = []; // paths to compose into main cover image

    let linkCounter = 0;
    
    for (let i = 0; i < validItems.length; i++) {
      const item = validItems[i];
      if (item.type === 'url') {
        const url = item.value.trim();
        linkCounter++;
        try {
          console.log(`[Newsletter Compiler] Kazınıyor (Link #${linkCounter}): ${url}`);
          const scraped = await scrapeUrl(url);
          if (scraped && scraped.text && scraped.text.length > 50) {
            let localImageUrl = null;
            if (scraped.cover_image) {
              console.log(`[Newsletter Compiler] Kaynak görsel yerelleştiriliyor: ${scraped.cover_image}`);
              localImageUrl = await downloadAndSaveAsWebP(scraped.cover_image);
            }
            
            const sourceName = getDomainSourceName(url);

            processedStories.push({
              type: 'url',
              title: scraped.title,
              text: scraped.text,
              cover_image: localImageUrl,
              source: sourceName,
              url
            });

            if (localImageUrl) {
              // Save resolved path for HTML placeholder replacement (1-indexed for placeholder data-id)
              scrapedImages.push({ slotId: processedStories.length, url: localImageUrl });
              collageImagePaths.push(localImageUrl);
            }
          }
        } catch (err) {
          console.warn(`[Newsletter Compiler] Link kazınamadı: ${url}. Hata: ${err.message}`);
        }
      } else {
        // Düz metin / Yazı girdisi
        const text = item.value.trim();
        console.log(`[Newsletter Compiler] Metin girdisi işleniyor, uzunluk: ${text.length}`);
        
        processedStories.push({
          type: 'text',
          title: `Haber Konusu #${processedStories.length + 1}`,
          text: text,
          cover_image: null,
          source: 'Editör Özel'
        });
      }
    }

    if (processedStories.length === 0) {
      throw new Error('İçeriklerin hiçbirinden geçerli haber verisi elde edilemedi.');
    }

    // 2. Compile text for Groq
    const combinedText = processedStories.map((story, idx) => {
      if (story.type === 'url') {
        return `Haber #${idx + 1} (Link):\nBaşlık: ${story.title}\nKaynak: ${story.source} (${story.url})\nİçerik:\n${story.text}`;
      } else {
        return `Haber #${idx + 1} (Yazı / Paragraf):\nİçerik:\n${story.text}`;
      }
    }).join('\n\n---\n\n');

    console.log('[Newsletter Compiler] Groq AI ile bülten derleniyor...');
    const result = await processNewsletterContent(combinedText);

    // 3. Generate collage cover image from collected images (up to 7)
    console.log(`[Newsletter Compiler] ${collageImagePaths.length} adet görsel ile kapak kolajı oluşturuluyor...`);
    const collageUrl = await createCollage(collageImagePaths);
    result.cover_image = collageUrl;

    // Prepare placeholders for editor
    if (result.content) {
      result.content = preparePlaceholdersForEditor(result.content);
    }

    // 4. Return result and resolved slot images
    return res.json({
      success: true,
      data: result,
      resolvedImages: scrapedImages
    });

  } catch (error) {
    console.error('Bülten işleme hatası:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// WebP image optimizer helper
async function convertToWebP(inputPath) {
  const ext = path.extname(inputPath);
  const dir = path.dirname(inputPath);
  const base = path.basename(inputPath, ext);
  const webpFilename = base + '.webp';
  const outputPath = path.join(dir, webpFilename);

  try {
    await sharp(inputPath)
      .resize(1200, null, { withoutEnlargement: true })
      .webp({ quality: 80 })
      .toFile(outputPath);
      
    // Delete original file
    fs.unlink(inputPath, () => {});
    return '/uploads/' + webpFilename;
  } catch (error) {
    console.error('Sharp WebP conversion error:', error);
    // Fallback: return original url if conversion fails
    return '/uploads/' + path.basename(inputPath);
  }
}

// Image upload endpoint
router.post('/upload', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'Dosya yüklenemedi.' });
  }

  const url = await convertToWebP(req.file.path);
  return res.json({ success: true, url });
});

// Image download from URL endpoint
router.post('/upload-url', async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ success: false, message: 'URL adresi boş olamaz.' });
  }

  try {
    const localUrl = await downloadAndSaveAsWebP(url);
    if (!localUrl) {
      throw new Error('Görsel indirilemedi veya işlenemedi.');
    }
    return res.json({ success: true, url: localUrl });
  } catch (error) {
    console.error('Görsel indirme hatası:', error.message);
    return res.status(500).json({ success: false, message: `Görsel indirilemedi: ${error.message}` });
  }
});

// Save social card image endpoint
router.post('/upload-card', (req, res) => {
  const { slug, image } = req.body;
  if (!slug || !image) {
    return res.status(400).json({ success: false, message: 'Eksik parametreler.' });
  }

  try {
    const cardsDir = path.join(__dirname, '..', 'data', 'uploads', 'cards');
    if (!fs.existsSync(cardsDir)) {
      fs.mkdirSync(cardsDir, { recursive: true });
    }

    // Strip header from dataUrl
    const base64Data = image.replace(/^data:image\/png;base64,/, "");
    const localPath = path.join(cardsDir, `${slug}.png`);

    fs.writeFileSync(localPath, base64Data, 'base64');
    
    const url = `/uploads/cards/${slug}.png`;
    return res.json({ success: true, url });

  } catch (error) {
    console.error('Social card saving error:', error.message);
    return res.status(500).json({ success: false, message: `Sosyal kart kaydedilemedi: ${error.message}` });
  }
});

// Fetch financial data from Yahoo Finance endpoint
function fetchYahooFinance(symbol) {
  return new Promise((resolve) => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
    
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
      }
    };

    https.get(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const result = json.chart?.result?.[0];
          if (!result) return resolve(null);
          
          const meta = result.meta;
          const price = meta.regularMarketPrice;
          const prevClose = meta.chartPreviousClose || meta.previousClose;
          const change = price - prevClose;
          const changePercent = prevClose ? (change / prevClose) * 100 : 0;
          
          resolve({
            symbol,
            price,
            changePercent,
            currency: meta.currency
          });
        } catch (e) {
          resolve(null);
        }
      });
    }).on('error', () => {
      resolve(null);
    });
  });
}

router.get('/market-data', async (req, res) => {
  const symbols = [
    'USDTRY=X', 'EURTRY=X', 'EURUSD=X', 
    'XU100.IS', '^GSPC', '^IXIC', '^GDAXI', '^FTSE', 
    'AAPL', 'TSLA', 'NVDA'
  ];
  
  try {
    const promises = symbols.map(sym => fetchYahooFinance(sym));
    const results = await Promise.all(promises);
    
    const data = {};
    results.forEach(item => {
      if (item) {
        data[item.symbol] = item;
      }
    });
    
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.json({ success: true, data });
  } catch (error) {
    console.error('Market data error:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
