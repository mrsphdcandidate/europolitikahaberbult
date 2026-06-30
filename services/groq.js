const Groq = require('groq-sdk');

const apiKeys = (process.env.GROQ_API_KEYS
  ? process.env.GROQ_API_KEYS.split(',').map(k => k.trim())
  : [process.env.GROQ_API_KEY]
).filter(k => k && k.startsWith('gsk_'));

const clients = apiKeys.map(key => new Groq({ apiKey: key }));
let currentKeyIndex = 0;

const SYSTEM_PROMPT = `Sen profesyonel bir haber editörüsün. Sana verilen ham metni veya haber içeriğini, ANLAMINI VE ÖNEMLİ DETAYLARINI HİÇBİR ŞEKİLDE DEĞİŞTİRMEDEN VE KISALTMA YAPMADAN özgün cümlelerle yeniden yazmalısın (paraphrase). Yanıtını JSON formatında ver: {"title": "...", "excerpt": "...", "content": "...", "category": "...", "tags": ["..."], "image_keywords": "..."}

ÖNEMLİ KURALLAR:
1. KISALTMA YAPMA: Orijinal metindeki tüm argümanları, verileri, kişileri ve önemli detayları koru. Haberi özetlemek yerine, orijinal uzunluğuna yakın, derinlikli ve detaylı bir şekilde yeniden kaleme al.
2. PARAPHRASE ET: Cümle yapılarını ve kelimeleri profesyonel, akıcı bir gazetecilik Türkçe'siyle yeniden şekillendir. Anlam kayması veya yorum ekleme yapma.
3. Content: HTML formatında, <p>, <h2>, <h3>, <blockquote>, <ul>, <li> tagları kullan. Detaylı ve uzun paragraflar yaz.
- Görsel yer tutucu etiketlerini tam olarak şu formatta yaz: <div class="image-placeholder" data-id="[sıra-no]" data-prompt="[Türkçe görsel açıklaması]" data-search="[İngilizce arama terimleri]"></div> (Örn: <div class="image-placeholder" data-id="1" data-prompt="Avrupa Merkez Bankası binası önünde euro simgesi" data-search="european central bank building euro sign"></div>). data-prompt kısmına Türkçe açıklamayı, data-search kısmına ise Google Görseller'de aratılacak İngilizce arama terimlerini yazın.
4. Title: Dikkat çekici, profesyonel başlık.
5. Excerpt: 2-3 cümlelik çarpıcı özet.
6. Category: Makroekonomi, Türkiye Ekonomisi, Küresel Politika, Piyasalar, Analiz, Gezi, Genel seçeneklerinden biri (haberin konusuna göre seç).
7. Tags: 3-5 anahtar kelime.
8. image_keywords: SADECE şu listeden seçilmiş, ana kapak görseli için en uygun tek bir kelime: finance, money, bank, business, market, politics, government, meeting, europe, travel, beach, hotel, resort, nature, restaurant.`;

/**
 * Process raw text content through Groq AI to generate
 * a structured, professional news article.
 *
 * @param {string} rawText - The raw input text to transform
 * @returns {Promise<Object>} Structured article object with title, excerpt, content, category, tags
 */
async function processContent(rawText) {
  if (clients.length === 0) {
    throw new Error('Tanımlı Groq API anahtarı bulunamadı. Lütfen .env dosyasında GROQ_API_KEY veya GROQ_API_KEYS tanımlayın.');
  }

  let attempts = 0;

  while (attempts < clients.length) {
    const activeIndex = (currentKeyIndex + attempts) % clients.length;
    const client = clients[activeIndex];

    try {
      console.log(`[Groq AI] API anahtarı deneniyor (İndeks: ${activeIndex}/${clients.length - 1})...`);
      const chatCompletion = await client.chat.completions.create({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: rawText }
        ],
        model: 'llama-3.3-70b-versatile',
        temperature: 0.7,
        max_tokens: 4096,
        response_format: { type: 'json_object' }
      });

      // Save successful index as start point for future requests
      currentKeyIndex = activeIndex;

      const responseText = chatCompletion.choices[0]?.message?.content;
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
      console.warn(`[Groq AI] İndeks ${activeIndex} anahtarı başarısız oldu: ${error.message}`);

      const status = error.status;
      const msg = error.message ? error.message.toLowerCase() : '';
      const isLimitOrCreditError = 
        status === 401 || 
        status === 429 || 
        msg.includes('rate_limit') ||
        msg.includes('insufficient_funds') ||
        msg.includes('quota') ||
        msg.includes('limit') ||
        msg.includes('credit') ||
        msg.includes('balance') ||
        msg.includes('authorized') ||
        msg.includes('auth');

      if (isLimitOrCreditError) {
        console.log(`[Groq AI] Limit/Kredi aşımı veya yetki hatası algılandı. Diğer anahtara geçiliyor...`);
        attempts++;
      } else {
        // Parse error or system issue, throw directly
        throw error;
      }
    }
  }

  // If all keys fail
  currentKeyIndex = (currentKeyIndex + 1) % clients.length;
  throw new Error('Groq Kredisi Bitti! (Kayıtlı tüm API anahtarlarının limiti veya bakiyesi tükendi.)');
}

module.exports = { processContent };
