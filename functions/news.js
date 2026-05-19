const https = require('https');

const GNEWS_KEY    = process.env.GNEWS_API_KEY;
const GUARDIAN_KEY = process.env.GUARDIAN_API_KEY;
const CURRENTS_KEY = process.env.CURRENTS_API_KEY;

function get(options) {
  return new Promise((resolve, reject) => {
    https.get(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

// ── GNews ──────────────────────────────────────────────
async function fetchGNews(q, lang = 'en', max = 7) {
  const qs = new URLSearchParams({
    q, lang, max, apikey: GNEWS_KEY, sortby: 'publishedAt'
  }).toString();
  const body = await get({
    hostname: 'gnews.io',
    path: `/api/v4/search?${qs}`,
    headers: { 'User-Agent': 'KarlsMorningBrief/1.0' }
  });
  const data = JSON.parse(body);
  if (!data.articles) throw new Error(data.errors?.[0] || 'GNews error');
  return data.articles.map(a => ({
    title: a.title,
    description: a.description,
    url: a.url,
    publishedAt: a.publishedAt,
    source: { name: a.source?.name || 'GNews' }
  }));
}

// ── Guardian ────────────────────────────────────────────
async function fetchGuardian(q, section, max = 7) {
  const params = {
    q,
    'api-key': GUARDIAN_KEY,
    'page-size': max,
    'order-by': 'newest',
    'show-fields': 'trailText,publication'
  };
  if (section) params.section = section;
  const qs = new URLSearchParams(params).toString();
  const body = await get({
    hostname: 'content.guardianapis.com',
    path: `/search?${qs}`,
    headers: { 'User-Agent': 'KarlsMorningBrief/1.0' }
  });
  const data = JSON.parse(body);
  if (data.response?.status !== 'ok') throw new Error('Guardian API error');
  return data.response.results.map(a => ({
    title: a.webTitle,
    description: a.fields?.trailText || '',
    url: a.webUrl,
    publishedAt: a.webPublicationDate,
    source: { name: 'The Guardian' }
  }));
}

// ── Currents ────────────────────────────────────────────
async function fetchCurrents(keywords, category, max = 7) {
  const params = {
    apiKey: CURRENTS_KEY,
    language: 'en',
    limit: max,
    type: '1'
  };
  if (keywords) params.keywords = keywords;
  if (category) params.category = category;
  const qs = new URLSearchParams(params).toString();
  const body = await get({
    hostname: 'api.currentsapi.services',
    path: `/v1/search?${qs}`,
    headers: { 'User-Agent': 'KarlsMorningBrief/1.0' }
  });
  const data = JSON.parse(body);
  if (data.status !== 'ok') throw new Error(data.message || 'Currents error');
  return (data.news || []).map(a => ({
    title: a.title,
    description: a.description,
    url: a.url,
    publishedAt: a.published,
    source: { name: a.author || 'Currents' }
  }));
}

// ── SECTION ROUTER ──────────────────────────────────────
async function getSection(section) {
  switch (section) {

    case 'texas':
      return fetchGNews('Texas', 'en', 7);

    case 'us':
      return fetchGNews(
        'United States OR White House OR Congress OR Senate OR Supreme Court',
        'en', 7
      );

    case 'germany':
      // Guardian has strong Europe/Germany coverage
      try {
        return await fetchGuardian('Germany', null, 7);
      } catch {
        return fetchGNews('Germany', 'en', 7);
      }

    case 'world':
      // Guardian is excellent for international news
      try {
        return await fetchGuardian(null, 'world', 7);
      } catch {
        return fetchGNews(
          'Iran OR "Middle East" OR NATO OR Ukraine OR China OR Russia',
          'en', 7
        );
      }

    case 'tech':
      // Currents has a dedicated technology category
      try {
        return await fetchCurrents(null, 'technology', 7);
      } catch {
        return fetchGNews(
          'AI OR artificial intelligence OR Apple OR Google OR Microsoft OR OpenAI',
          'en', 7
        );
      }

    case 'sports':
      try {
        return await fetchGuardian(null, 'sport', 7);
      } catch {
        return fetchGNews(
          'NBA OR NFL OR MLB OR Masters OR NCAA OR sports',
          'en', 7
        );
      }

    default:
      throw new Error('Unknown section: ' + section);
  }
}

// ── HANDLER ─────────────────────────────────────────────
exports.handler = async function(event) {
  const section = (event.queryStringParameters || {}).section;

  if (!section) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing section parameter' })
    };
  }

  try {
    const articles = await getSection(section);
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=600' // cache 10 min to save API calls
      },
      body: JSON.stringify({ status: 'ok', articles })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ status: 'error', message: err.message })
    };
  }
};
