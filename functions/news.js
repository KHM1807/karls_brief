const https = require('https');

const GNEWS_KEY = process.env.GNEWS_API_KEY;

function get(options, timeoutMs = 9000) {
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

async function fetchGNews(q, max = 7) {
  const qs = new URLSearchParams({
    q,
    lang: 'en',
    max,
    apikey: GNEWS_KEY,
    sortby: 'publishedAt'
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

const QUERIES = {
  texas:   'Texas',
  us:      'United States America',
  germany: 'Germany',
  world:   'world international',
  tech:    'technology AI',
  sports:  'sports'
};

exports.handler = async function(event) {
  const section = (event.queryStringParameters || {}).section;

  if (!section || !QUERIES[section]) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ status: 'error', message: 'Invalid or missing section' })
    };
  }

  try {
    const articles = await fetchGNews(QUERIES[section], 7);
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
    console.error(`[${section}] ${err.message}`);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ status: 'error', message: err.message })
    };
  }
};
