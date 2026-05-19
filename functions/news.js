const https = require('https');

const GNEWS_KEY    = process.env.GNEWS_API_KEY;
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

// ── Currents ────────────────────────────────────────────
async function fetchCurrents(keywords, max = 7) {
  const params = {
    apiKey: CURRENTS_KEY,
    language: 'en',
    limit: max,
    keywords
  };
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
      return fetchGNews('United States politics White House Congress economy', 7);

    case 'germany':
      return fetchGNews('Germany Berlin Merz Europe', 7);

    case 'world':
      return fetchGNews('world international news Iran Middle East NATO Ukraine China', 7);

    case 'tech':
      try { return await fetchCurrents('artificial intelligence technology Apple Google Microsoft OpenAI', 7); }
      catch(e) { return fetchGNews('AI technology Apple Google Microsoft OpenAI', 7); }

    case 'sports':
      return fetchGNews('NBA NFL MLB Masters golf NCAA sports', 7);

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
