const https = require('https');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = JSON.stringify(req.body);

    const response = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
      };

      const req2 = https.request(options, (res2) => {
        let data = '';
        res2.on('data', chunk => { data += chunk; });
        res2.on('end', () => resolve({ status: res2.statusCode, body: data }));
      });

      req2.on('error', reject);
      req2.write(body);
      req2.end();
    });

    res.status(response.status).json(JSON.parse(response.body));
  } catch (err) {
    console.error('Proxy error:', err);
    res.status(500).json({ error: 'Erro interno no proxy' });
  }
};
