const { sendMetaEvent, inferVariant } = require('./_meta');

const ALLOWED = new Set(['PageView', 'ViewContent', 'InitiateCheckout']);

module.exports = async function metaEvent(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ message: 'Method not allowed' });
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  } catch {
    return res.status(400).json({ message: 'Invalid JSON' });
  }

  if (!ALLOWED.has(body.eventName) || !body.eventId) {
    return res.status(400).json({ message: 'Invalid event' });
  }

  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  const variant = body.landing_variant || inferVariant(host);

  const result = await sendMetaEvent({
    eventName: body.eventName,
    eventId: String(body.eventId),
    eventSourceUrl: String(body.eventSourceUrl || ''),
    landingVariant: variant,
    customData: body.customData || {},
    userData: {
      fbp: body.fbp,
      fbc: body.fbc
    },
    req
  });

  res.setHeader('Cache-Control', 'no-store');
  return res.status(result.ok ? 200 : 502).json({ ok: result.ok });
};
