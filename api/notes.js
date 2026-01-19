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

const getAllowedEmails = (value) =>
  String(value || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

module.exports = async (req, res) => {
  if (!['GET', 'POST', 'PATCH'].includes(req.method)) {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_EMAILS } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !ADMIN_EMAILS) {
    sendJson(res, 500, { error: 'Server not configured.' });
    return;
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/Bearer\s+/i, '').trim();
  if (!token) {
    sendJson(res, 401, { error: 'Unauthorized.' });
    return;
  }

  const allowedEmails = getAllowedEmails(ADMIN_EMAILS);
  if (!allowedEmails.length) {
    sendJson(res, 500, { error: 'Admin access not configured.' });
    return;
  }

  const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_SERVICE_ROLE_KEY,
    },
  });

  if (!userResponse.ok) {
    sendJson(res, 401, { error: 'Unauthorized.' });
    return;
  }

  const user = await userResponse.json();
  const userEmail = String(user?.email || '').toLowerCase();
  if (!allowedEmails.includes(userEmail)) {
    sendJson(res, 401, { error: 'Not allowed.' });
    return;
  }

  if (req.method === 'GET') {
    const url = new URL(`${SUPABASE_URL}/rest/v1/notes`);
    url.searchParams.set('select', '*');
    url.searchParams.set('order', 'created_at.desc');

    const response = await fetch(url.toString(), {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });

    if (!response.ok) {
      const message = await response.text();
      sendJson(res, 500, { error: message || 'Failed to load notes.' });
      return;
    }

    const notes = await response.json();
    sendJson(res, 200, { notes });
    return;
  }

  const body = await parseBody(req);

  if (req.method === 'POST') {
    const text = String(body?.text || '').trim();
    if (!text) {
      sendJson(res, 400, { error: 'Note text is required.' });
      return;
    }

    const payload = {
      text,
      done: false,
    };

    const createResponse = await fetch(`${SUPABASE_URL}/rest/v1/notes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: 'return=representation',
      },
      body: JSON.stringify(payload),
    });

    if (!createResponse.ok) {
      const message = await createResponse.text();
      sendJson(res, 500, { error: message || 'Failed to create note.' });
      return;
    }

    const created = await createResponse.json();
    sendJson(res, 200, { note: created[0] });
    return;
  }

  const id = String(body?.id || '').trim();
  if (!id) {
    sendJson(res, 400, { error: 'Missing note id.' });
    return;
  }

  const updatePayload = {};
  if (body?.text !== undefined) {
    const text = String(body.text || '').trim();
    if (!text) {
      sendJson(res, 400, { error: 'Note text is required.' });
      return;
    }
    updatePayload.text = text;
  }
  if (body?.done !== undefined) {
    updatePayload.done = Boolean(body.done);
  }

  if (!Object.keys(updatePayload).length) {
    sendJson(res, 400, { error: 'Nothing to update.' });
    return;
  }

  const url = new URL(`${SUPABASE_URL}/rest/v1/notes`);
  url.searchParams.set('id', `eq.${id}`);

  const response = await fetch(url.toString(), {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: 'return=representation',
    },
    body: JSON.stringify(updatePayload),
  });

  if (!response.ok) {
    const message = await response.text();
    sendJson(res, 500, { error: message || 'Failed to update note.' });
    return;
  }

  const updated = await response.json();
  sendJson(res, 200, { note: updated[0] });
};
