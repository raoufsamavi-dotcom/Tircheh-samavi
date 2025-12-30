const https = require('https');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH = 'main', GITHUB_TOKEN } = process.env;

  if (!GITHUB_OWNER || !GITHUB_REPO || !GITHUB_TOKEN) {
    return res.status(500).json({ error: 'GitHub environment variables missing' });
  }

  try {
    const newConfig = req.body;
    const filePath = 'config.json';

    const getFileData = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.github.com',
        path: `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}?ref=${GITHUB_BRANCH}`,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github+json',
          'User-Agent': 'Vercel-Function'
        }
      };

      const getReq = https.request(options, (getRes) => {
        let data = '';
        getRes.on('data', chunk => data += chunk);
        getRes.on('end', () => {
          if (getRes.statusCode !== 200) {
            reject(new Error(`Failed: ${getRes.statusCode}`));
          } else {
            resolve(JSON.parse(data));
          }
        });
      });
      getReq.on('error', reject);
      getReq.end();
    });

    const sha = getFileData.sha;
    const newContentBase64 = Buffer.from(JSON.stringify(newConfig, null, 2), 'utf8').toString('base64');

    const updateResult = await new Promise((resolve, reject) => {
      const payload = JSON.stringify({
        message: 'Update config.json via admin panel',
        content: newContentBase64,
        sha: sha,
        branch: GITHUB_BRANCH
      });

      const options = {
        hostname: 'api.github.com',
        path: `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`,
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github+json',
          'User-Agent': 'Vercel-Function',
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      };

      const putReq = https.request(options, (putRes) => {
        let data = '';
        putRes.on('data', chunk => data += chunk);
        putRes.on('end', () => {
          if (putRes.statusCode !== 200 && putRes.statusCode !== 201) {
            reject(new Error(`Failed: ${putRes.statusCode}`));
          } else {
            resolve(JSON.parse(data));
          }
        });
      });
      putReq.on('error', reject);
      putReq.write(payload);
      putReq.end();
    });

    return res.status(200).json({ ok: true, commit: updateResult.commit.sha });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
