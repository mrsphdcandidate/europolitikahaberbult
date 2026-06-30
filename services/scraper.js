const cheerio = require('cheerio');

/**
 * Scrapes a web page to extract its main article text content.
 * 
 * @param {string} url - The URL of the page to scrape
 * @returns {Promise<{title: string, text: string}>}
 */
async function scrapeUrl(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7'
      }
    });

    if (!response.ok) {
      throw new Error(`Sayfa yüklenemedi. HTTP Durum Kodu: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Remove elements that are irrelevant to article body
    $('script, style, nav, footer, header, iframe, noscript, svg, form, header, .ads, #ads, .comments, #comments, .sidebar, #sidebar, .header, .footer, .menu, .nav, .navigation, .related-posts, .related, .tags, .social-share').remove();

    let mainContent = '';

    // Try target article selectors
    const selectors = [
      'article', 
      '[itemprop="articleBody"]',
      '.article-body', 
      '.article-content', 
      '.post-content', 
      '.entry-content', 
      '#main-content', 
      '.story-content', 
      '.news-content', 
      '.main-text',
      '.page-content',
      'main'
    ];

    for (const selector of selectors) {
      const el = $(selector);
      if (el.length > 0) {
        // Find paragraphs
        const paragraphs = el.find('p').map((i, p) => $(p).text().trim()).get();
        const validParagraphs = paragraphs.filter(text => text.length > 20);
        if (validParagraphs.length > 0) {
          mainContent = validParagraphs.join('\n\n');
          break;
        }
      }
    }

    // Fallback: get all paragraph texts from the document
    if (!mainContent) {
      const paragraphs = $('body p').map((i, p) => $(p).text().trim()).get();
      const validParagraphs = paragraphs.filter(text => text.length > 40);
      mainContent = validParagraphs.slice(0, 40).join('\n\n');
    }

    // Get document title
    const pageTitle = $('title').text().trim();

    return {
      title: pageTitle,
      text: mainContent.trim()
    };
  } catch (error) {
    console.error('Scraping error:', error.message);
    throw new Error(`Web sayfasından içerik çekilirken hata oluştu: ${error.message}`);
  }
}

module.exports = { scrapeUrl };
