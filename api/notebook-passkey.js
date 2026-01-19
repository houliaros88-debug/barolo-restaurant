const sendJson = (res, status, payload) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
};

const parseBody = async (req) => {
  if (req.body) {
    if (typeof req.body === 'string') {
      try {
        return JSON.parse(req.body);
      } catch (error) {
        return {};
      }
    }
    return req.body;
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    return {};
  }
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  const { NOTEBOOK_PASSKEY } = process.env;
  if (!NOTEBOOK_PASSKEY) {
    sendJson(res, 500, { error: 'Server not configured.' });
    return;
  }

  const body = await parseBody(req);
  const passkey = String(body?.passkey || '').trim();
  if (!passkey) {
    sendJson(res, 400, { error: 'Pass key required.' });
    return;
  }

  if (passkey !== NOTEBOOK_PASSKEY) {
    sendJson(res, 401, { error: 'Invalid pass key.' });
    return;
  }

  sendJson(res, 200, { ok: true });
};
