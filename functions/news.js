const https = require('https');

const GNEWS_KEY    = process.env.GNEWS_API_KEY;
const GUARDIAN_KEY = process.env.GUARDIAN_API_KEY;
const CURRENTS_KEY = process.env.CURRENTS_API_KEY;

function get(options, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const req = https.get(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
  });
}

// ── GNews ──────────────────────────────────────────────
async function fetchGNews(q, max = 7) {
  const qs = new URLSearchParams({
    q, lang: 'en', max, apikey: GNEWS_KEY, sortby: 'publishedAt'
  }).toString();
  const body = await get({
    hostname: 'gnews.io',
    path: `/api/v4/search?${qs}`,
    headers: { 'User-Agent': 'KarlsMorningBrief/1.0' }
  });
  const data = JSON.parse(body);
  if (!data.articles) throw new Error(data.errors?.[0] || JSON.stringify(data));
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
    'api-key': GUARDIAN_KEY,
    'page-size': max,
    'order-by': 'newest',
    'show-fields': 'trailText'
  };
  if (q) params.q = q;
  if (section) params.section = section;
  const qs = new URLSearchParams(params).toString();
  const body = await get({
    hostname: 'content.guardianapis.com',
    path: `/search?${qs}`,
    headers: { 'User-Agent': 'KarlsMorningBrief/1.0' }
  });
  const data = JSON.parse(body);
  if (data.response?.status !== 'ok') throw new Error('Guardian: ' + JSON.stringify(data));
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
  const params = { apiKey: CURRENTS_KEY, language: 'en', limit: max };
  if (keywords) params.keywords = keywords;
  if (category) params.category = category;
  const qs = new URLSearchParams(params).toString();
  const body = await get({
    hostname: 'api.currentsapi.services',
    path: `/v1/search?${qs}`,
    headers: { 'User-Agent': 'KarlsMorningBrief/1.0' }
  });
  const data = JSON.parse(body);
  if (data.status !== 'ok') throw new Error('Currents: ' + JSON.stringify(data));
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
      return fetchGNews('Texas', 7);

    case 'us':
      return fetchGNews('United States White House Congress', 7);

    case 'germany':
      try { return await fetchGuardian('Germany', null, 7); }
      catch(e) { return fetchGNews('Germany', 7); }

    case 'world':
      try { return await fetchGuardian(null, 'world', 7); }
      catch(e) { return fetchGNews('world news international', 7); }

    case 'tech':
      try { return await fetchCurrents('artificial intelligence technology', 'technology', 7); }
      catch(e) { return fetchGNews('AI technology Apple Google Microsoft', 7); }

    case 'sports':
      try { return await fetchGuardian(null, 'sport', 7); }
      catch(e) { return fetchGNews('NBA NFL MLB sports', 7); }

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
      body: JSON.stringify({ status: 'error', message: 'Missing section parameter' })
    };
  }

  console.log('Keys present:', {
    gnews: !!GNEWS_KEY,
    guardian: !!GUARDIAN_KEY,
    currents: !!CURRENTS_KEY
  });

  try {
    const articles = await getSection(section);
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300'
      },
      body: JSON.stringify({ status: 'ok', articles })
    };
  } catch (err) {
    console.error('Section error [' + section + ']:', err.message);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ status: 'error', message: err.message })
    };
  }
};
