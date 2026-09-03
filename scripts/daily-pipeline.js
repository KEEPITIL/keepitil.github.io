/**
 * KEEP IT IL — Daily Content Pipeline
 * Runs at 6AM PST via GitHub Actions cron
 * Scrapes EDM news sources, rewrites in Keep It IL voice, saves to Supabase
 */

import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !ANTHROPIC_API_KEY) {
  console.error('Missing required env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY, ANTHROPIC_API_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// ─── Scrapers ────────────────────────────────────────────────────────────────

async function scrapeDJMag() {
  const articles = [];
  try {
    const res = await fetch('https://djmag.com/news', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KeepItIL/1.0)' },
      timeout: 15000
    });
    const html = await res.text();
    const $ = cheerio.load(html);

    $('article').slice(0, 5).each((_, el) => {
      const title = $(el).find('h2, h3').first().text().trim();
      const link = $(el).find('a').first().attr('href');
      const excerpt = $(el).find('p').first().text().trim();
      const img = $(el).find('img').first().attr('src') || $(el).find('img').first().attr('data-src');

      if (title && link) {
        articles.push({
          source: 'DJ Mag',
          title,
          url: link.startsWith('http') ? link : 'https://djmag.com' + link,
          excerpt: excerpt || '',
          image_url: img || null
        });
      }
    });
  } catch (e) {
    console.warn('DJ Mag scrape failed:', e.message);
  }
  return articles;
}

async function scrapeBeatport() {
  const articles = [];
  try {
    const res = await fetch('https://www.beatportal.com/', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KeepItIL/1.0)' },
      timeout: 15000
    });
    const html = await res.text();
    const $ = cheerio.load(html);

    $('article, .post, .card').slice(0, 5).each((_, el) => {
      const title = $(el).find('h2, h3, h4').first().text().trim();
      const link = $(el).find('a').first().attr('href');
      const excerpt = $(el).find('p').first().text().trim();
      const img = $(el).find('img').first().attr('src') || $(el).find('img').first().attr('data-src');

      if (title && link) {
        articles.push({
          source: 'Beatport',
          title,
          url: link.startsWith('http') ? link : 'https://www.beatportal.com' + link,
          excerpt: excerpt || '',
          image_url: img || null
        });
      }
    });
  } catch (e) {
    console.warn('Beatport scrape failed:', e.message);
  }
  return articles;
}

async function scrapeEDMTrain() {
  const articles = [];
  try {
    const res = await fetch('https://edmtrain.com/blog', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KeepItIL/1.0)' },
      timeout: 15000
    });
    const html = await res.text();
    const $ = cheerio.load(html);

    $('article, .blog-post, .post-item').slice(0, 3).each((_, el) => {
      const title = $(el).find('h2, h3').first().text().trim();
      const link = $(el).find('a').first().attr('href');
      const excerpt = $(el).find('p').first().text().trim();
      const img = $(el).find('img').first().attr('src');

      if (title && link) {
        articles.push({
          source: 'EDM Train',
          title,
          url: link.startsWith('http') ? link : 'https://edmtrain.com' + link,
          excerpt: excerpt || '',
          image_url: img || null
        });
      }
    });
  } catch (e) {
    console.warn('EDM Train scrape failed:', e.message);
  }
  return articles;
}

async function scrapeResiidentAdvisor() {
  const articles = [];
  try {
    // RA uses GraphQL — fetch editorial/news feed
    const res = await fetch('https://ra.co/news', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KeepItIL/1.0)' },
      timeout: 15000
    });
    const html = await res.text();
    const $ = cheerio.load(html);

    $('article, [data-testid="article-card"]').slice(0, 4).each((_, el) => {
      const title = $(el).find('h2, h3, h4').first().text().trim();
      const link = $(el).find('a').first().attr('href');
      const excerpt = $(el).find('p').first().text().trim();
      const img = $(el).find('img').first().attr('src');

      if (title && link) {
        articles.push({
          source: 'Resident Advisor',
          title,
          url: link.startsWith('http') ? link : 'https://ra.co' + link,
          excerpt: excerpt || '',
          image_url: img || null
        });
      }
    });
  } catch (e) {
    console.warn('RA scrape failed:', e.message);
  }
  return articles;
}

// ─── AI Rewrite ──────────────────────────────────────────────────────────────

async function rewriteInKeepItILVoice(article) {
  const prompt = `You are the editorial voice for KEEPITIL — a culture platform covering people, events, media and community across genres and cities. Your tone is energetic, direct, curious and creator-first. You don't sound corporate or generic.

Original article from ${article.source}:
TITLE: ${article.title}
EXCERPT: ${article.excerpt || '(no excerpt)'}
SOURCE URL: ${article.url}

Your task:
1. Write a punchy KEEPITIL blog post (200-350 words) that covers this topic through its relevance to creators and communities. If the news involves an artist, explain why they should be on the audience's radar.
2. Output ONLY valid JSON (no markdown, no code fences) with these exact fields:
{
  "title": "SEO-optimized headline in Keep It IL voice (max 70 chars)",
  "slug": "url-friendly-slug-from-title",
  "excerpt": "1-2 sentence teaser (max 155 chars, good for meta description)",
  "content": "Full HTML blog post body (use <p> and <strong> tags only, 200-350 words)",
  "category": "one of: news, events, artists, culture, gear",
  "tags": ["tag1", "tag2", "tag3"],
  "seo_title": "SEO title (max 60 chars)",
  "seo_description": "Meta description (max 155 chars)"
}`;

  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }]
  });

  const raw = msg.content[0].text.trim();
  // strip any accidental markdown fences
  const clean = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  return JSON.parse(clean);
}

// ─── Dedup Check ─────────────────────────────────────────────────────────────

async function isAlreadyPublished(sourceUrl) {
  const { data } = await supabase
    .from('blog_articles')
    .select('id')
    .eq('source_url', sourceUrl)
    .limit(1);
  return data && data.length > 0;
}

// ─── Save to Supabase ────────────────────────────────────────────────────────

async function saveArticle(rewritten, original) {
  const now = new Date().toISOString();
  const { error } = await supabase.from('blog_articles').insert({
    title: rewritten.title,
    slug: rewritten.slug + '-' + Date.now(),
    excerpt: rewritten.excerpt,
    content: rewritten.content,
    category: rewritten.category || 'news',
    tags: rewritten.tags || [],
    image_url: original.image_url || null,
    source_url: original.url,
    source_name: original.source,
    seo_title: rewritten.seo_title,
    seo_description: rewritten.seo_description,
    published: true,
    published_at: now,
    created_at: now
  });

  if (error) {
    console.error('Supabase insert error:', error.message);
    return false;
  }
  return true;
}

// ─── Main Pipeline ───────────────────────────────────────────────────────────

async function run() {
  console.log('[KEEP IT IL] Daily pipeline starting —', new Date().toISOString());

  // Scrape all sources in parallel
  const [djMagArticles, beatportArticles, edmTrainArticles, raArticles] = await Promise.all([
    scrapeDJMag(),
    scrapeBeatport(),
    scrapeEDMTrain(),
    scrapeResiidentAdvisor()
  ]);

  const allArticles = [...djMagArticles, ...beatportArticles, ...edmTrainArticles, ...raArticles];
  console.log(`Scraped ${allArticles.length} total articles`);

  let published = 0;
  let skipped = 0;
  const MAX_PER_RUN = 3; // Limit daily spend — 3 articles/day

  for (const article of allArticles) {
    if (published >= MAX_PER_RUN) break;
    if (!article.title || article.title.length < 10) { skipped++; continue; }

    // Skip dupes
    const isDupe = await isAlreadyPublished(article.url);
    if (isDupe) { skipped++; continue; }

    try {
      console.log(`Processing: "${article.title}" (${article.source})`);
      const rewritten = await rewriteInKeepItILVoice(article);
      const saved = await saveArticle(rewritten, article);
      if (saved) {
        published++;
        console.log(`✓ Published: "${rewritten.title}"`);
      }
    } catch (e) {
      console.error(`Failed to process "${article.title}":`, e.message);
      skipped++;
    }

    // Small delay to avoid rate limits
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log(`[KEEP IT IL] Pipeline complete — published: ${published}, skipped: ${skipped}`);
}

run().catch(e => {
  console.error('Pipeline fatal error:', e);
  process.exit(1);
});
