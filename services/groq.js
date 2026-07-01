const https = require('https');

const apiKeys = (process.env.GROQ_API_KEYS
  ? process.env.GROQ_API_KEYS.split(',').map(k => k.trim())
  : [process.env.GROQ_API_KEY]
).filter(k => k && k.startsWith('gsk_'));

let currentKeyIndex = 0;

const SYSTEM_PROMPT = `Sen profesyonel bir haber editörüsün. Sana verilen ham metni veya haber içeriğini, ANLAMINI VE ÖNEMLİ DETAYLARINI HİÇBİR ŞEKİLDE DEĞİŞTİRMEDEN VE KISALTMA YAPMADAN özgün cümlelerle yeniden yazmalısın (paraphrase). Yanıtını JSON formatında ver: {"title": "...", "excerpt": "...", "content": "...", "key_takeaways": ["...", "...", "..."], "category": "...", "tags": ["..."], "image_keywords": "..."}

ÖNEMLİ KURALLAR:
1. KISALTMA YAPMA: Orijinal metindeki tüm argümanları, verileri, kişileri ve önemli detayları koru. Haberi özetlemek yerine, orijinal uzunluğuna yakın, derinlikli ve detaylı bir şekilde yeniden kaleme al.
2. PARAPHRASE ET: Cümle yapılarını ve kelimeleri profesyonel, akıcı bir gazetecilik Türkçe'siyle yeniden şekillendir. Anlam kayması veya yorum ekleme yapma.
3. Content: HTML formatında, <p>, <h2>, <h3>, <blockquote>, <ul>, <li> tagları kullan. Detaylı ve uzun paragraflar yaz.
- Görsel yer tutucu etiketlerini tam olarak şu formatta yaz: <img class="image-placeholder" data-id="[sıra-no]" data-prompt="[Türkçe görsel açıklaması]" data-search="[İngilizce arama terimleri]"> (Örn: <img class="image-placeholder" data-id="1" data-prompt="Avrupa Merkez Bankası binası önünde euro simgesi" data-search="european central bank building euro sign">). data-prompt kısmına Türkçe açıklamayı, data-search kısmına ise Google Görseller'de aratılacak İngilizce arama terimlerini yazın.
4. Title: Dikkat çekici, profesyonel başlık.
5. Excerpt: 2-3 cümlelik çarpıcı özet.
6. key_takeaways: Yazının en can alıcı noktalarını, analizlerini veya önemli verilerini içeren, 3 maddeden oluşan kısa ve vurucu bir liste (Dizi halinde 3 adet Türkçe cümle).
7. Category: Makroekonomi, Türkiye Ekonomisi, Küresel Politika, Piyasalar, Analiz, Gezi, Genel seçeneklerinden biri (haberin konusuna göre seç).
8. Tags: 3-5 anahtar kelime.
9. image_keywords: SADECE şu listeden seçilmiş, ana kapak görseli için en uygun tek bir kelime: finance, money, bank, business, market, politics, government, meeting, europe, travel, beach, hotel, resort, nature, restaurant.`;

const NEWSLETTER_SYSTEM_PROMPT = `Sen bir politik ekonomi editörüsün. Sana verilen birden fazla haber içeriğini birleştirerek yatırımcılara ve okuyuculara yönelik tek bir haftalık/günlük bülten (digest) makalesi oluşturmalısın. 

ÖNEMLİ KURALLAR:
1. Başlık: Tüm haberleri kapsayan, merak uyandırıcı ve profesyonel genel bir bülten başlığı öner (Örn: "Haftalık Ekonomi Bülteni: Küresel Piyasalarda Enflasyon Rüzgarları").
2. Özet: Bültenin genelini 2-3 cümle ile özetleyen çarpıcı bir bülten özeti oluştur.
3. İçerik (HTML): Her haberi kendi içinde sırasıyla ele al. 
   - Her bir haber konusu için <h2> veya <h3> başlıkları aç.
   - Her haberi akıcı, profesyonel bir Türkçe ile detaylandır. Haberleri çok fazla kısaltma, önemli detayları koru.
   - Her haber konusunun altına tam olarak şu formatta bir görsel yer tutucu img etiketi ekle:
     <img class="image-placeholder" data-id="[sıra-no]" data-prompt="[Bu haber konusuyla ilgili Türkçe görsel açıklaması]" data-search="[İngilizce arama terimleri]">
     Örnek: <img class="image-placeholder" data-id="1" data-prompt="Avrupa enflasyon grafiği" data-search="europe inflation chart">
4. Kategori: Makroekonomi, Türkiye Ekonomisi, Küresel Politika, Piyasalar, Analiz seçeneklerinden biri (bültenin geneline en uygun olanı).
5. Etiketler: Bülten konularıyla ilgili 3-5 anahtar kelime.
6. Kaynak Bilgisi: Her haber konusunun anlatımının en son cümlesinin sonuna, parantez içinde o habere ait kaynağın ismini ekleyin (Örn: "(BBC)", "(DW)", "(Reuters)"). Bu kaynak ismi size haber girdisinde "Kaynak: [Isim]" şeklinde verilecektir, oradaki ismi birebir kullanın.
7. ÖNEMLİ - Editör Özel Analizi Koruma Kuralı: Eğer girdi olarak "Analiz #X (Editör Özel Analizi)" başlığı altında bir içerik verilirse, bu analizin metnine, kelimelerine ve cümle yapılarına ASLA MÜDAHALE ETMEYİN. İçeriği hiçbir şekilde değiştirmeden, özetlemeden veya yorum eklemeden, BİREBİR (verbatim) olarak bültenin ilgili bölümüne kopyalayın. Sadece başlıklandırmasını (<h2> veya <h3>) ve paragrafları düzenleyebilirsiniz, metnin kendisine dokunmayın.
8. key_takeaways: Bültenin genelinden çıkarılacak, yatırımcılar ve okuyucular için en önemli 3 can alıcı mesajı/noktayı içeren kısa ve vurucu bir liste (Dizi halinde 3 adet Türkçe cümle).
9. Yanıtını JSON formatında ver: {"title": "...", "excerpt": "...", "content": "...", "key_takeaways": ["...", "...", "..."], "category": "...", "tags": ["..."]}`;

// Stable raw HTTPS request helper to bypass Node.js native fetch / undici socket drop bugs
function makeRawGroqRequest(apiKey, payload) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(payload);
    
    const options = {
      hostname: 'api.groq.com',
      port: 443,
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 180000 // 3 minutes timeout
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          try {
            const errJson = JSON.parse(data);
            reject(new Error(errJson.error?.message || `HTTP Status Code: ${res.statusCode}`));
          } catch (e) {
            reject(new Error(`HTTP Status Code: ${res.statusCode}. Raw response: ${data.slice(0, 100)}`));
          }
          return;
        }
        
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (e) {
          reject(new Error('Failed to parse JSON response from Groq API'));
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Groq API request timeout after 3 minutes'));
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Process raw text content through Groq AI to generate
 * a structured, professional news article.
 */
async function processContent(rawText) {
  if (apiKeys.length === 0) {
    throw new Error('Tanımlı Groq API anahtarı bulunamadı. Lütfen .env dosyasında GROQ_API_KEY veya GROQ_API_KEYS tanımlayın.');
  }

  const maxAttempts = Math.max(apiKeys.length * 2, 3);
  let attempts = 0;

  while (attempts < maxAttempts) {
    const activeIndex = (currentKeyIndex + attempts) % apiKeys.length;
    const apiKey = apiKeys[activeIndex];

    try {
      console.log(`[Groq AI] API anahtarı deneniyor (İndeks: ${activeIndex}/${apiKeys.length - 1}, Deneme: ${attempts + 1}/${maxAttempts})...`);
      
      const payload = {
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: rawText }
        ],
        model: 'llama-3.3-70b-versatile',
        temperature: 0.7,
        max_tokens: 4096,
        response_format: { type: 'json_object' }
      };

      const response = await makeRawGroqRequest(apiKey, payload);
      
      currentKeyIndex = activeIndex;

      const responseText = response.choices[0]?.message?.content;
      if (!responseText) {
        throw new Error('Groq API boş yanıt döndürdü.');
      }

      const parsed = JSON.parse(responseText);

      // Ensure tags is always an array
      if (parsed.tags && typeof parsed.tags === 'string') {
        parsed.tags = parsed.tags.split(',').map(t => t.trim());
      }

      return parsed;

    } catch (error) {
      console.warn(`[Groq AI] İndeks ${activeIndex} anahtarı başarısız oldu (Hata: ${error.message}). Yeniden deneniyor...`);
      attempts++;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  throw new Error('Groq AI Servisi Başarısız Oldu! Sunucu veya ağ hatası ya da tüm API anahtarlarının limiti/bakiyesi tükendi.');
}

async function processNewsletterContent(combinedText) {
  if (apiKeys.length === 0) {
    throw new Error('Tanımlı Groq API anahtarı bulunamadı. Lütfen .env dosyasında GROQ_API_KEY veya GROQ_API_KEYS tanımlayın.');
  }

  const maxAttempts = Math.max(apiKeys.length * 2, 3);
  let attempts = 0;

  while (attempts < maxAttempts) {
    const activeIndex = (currentKeyIndex + attempts) % apiKeys.length;
    const apiKey = apiKeys[activeIndex];

    try {
      console.log(`[Groq AI Newsletter] API anahtarı deneniyor (İndeks: ${activeIndex}/${apiKeys.length - 1}, Deneme: ${attempts + 1}/${maxAttempts})...`);
      
      const payload = {
        messages: [
          { role: 'system', content: NEWSLETTER_SYSTEM_PROMPT },
          { role: 'user', content: combinedText }
        ],
        model: 'llama-3.3-70b-versatile',
        temperature: 0.7,
        max_tokens: 4096,
        response_format: { type: 'json_object' }
      };

      const response = await makeRawGroqRequest(apiKey, payload);

      currentKeyIndex = activeIndex;

      const responseText = response.choices[0]?.message?.content;
      if (!responseText) {
        throw new Error('Groq API boş yanıt döndürdü.');
      }

      const parsed = JSON.parse(responseText);

      if (parsed.tags && typeof parsed.tags === 'string') {
        parsed.tags = parsed.tags.split(',').map(t => t.trim());
      }

      return parsed;

    } catch (error) {
      console.warn(`[Groq AI Newsletter] İndeks ${activeIndex} anahtarı başarısız oldu (Hata: ${error.message}). Yeniden deneniyor...`);
      attempts++;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  throw new Error('Groq AI Servisi Başarısız Oldu! Sunucu veya ağ hatası ya da tüm API anahtarlarının limiti/bakiyesi tükendi.');
}

module.exports = { processContent, processNewsletterContent };
