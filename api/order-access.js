const crypto = require('crypto');
const { getOrderState } = require('./_order-state');

const createStatusToken = (orderReference, secret) =>
  crypto.createHmac('sha256', secret).update(orderReference, 'utf8').digest('hex');

const safeEqual = (left, right) => {
  const leftBuffer = Buffer.from(String(left || '').toLowerCase());
  const rightBuffer = Buffer.from(String(right || '').toLowerCase());
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

module.exports = async function orderAccess(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const secretKey = process.env.WFP_MERCHANT_SECRET_KEY;
  const courseAccessUrl = process.env.COURSE_ACCESS_URL;

  if (!secretKey || !courseAccessUrl) {
    return res.status(500).json({ message: 'Configuration missing' });
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  } catch {
    return res.status(400).json({ message: 'Invalid JSON' });
  }

  const orderReference = String(body.orderReference || '');
  const statusToken = String(body.statusToken || '');

  if (
    !/^FITBEAUTY-\d+-[a-f0-9]{8}$/.test(orderReference) ||
    !safeEqual(statusToken, createStatusToken(orderReference, secretKey))
  ) {
    return res.status(400).json({ message: 'Invalid order' });
  }

  const stateResult = await getOrderState(orderReference);
  if (!stateResult.ok) {
    return res.status(502).json({ message: 'Unable to verify order' });
  }

  const state = stateResult.result || {};
  if (!state.confirmed || state.purchaseState !== 'sent') {
    return res.status(403).json({ confirmed: false });
  }

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    confirmed: true,
    accessUrl: courseAccessUrl,
    purchaseEventId: state.purchaseEventId,
    amount: state.amount,
    currency: state.currency,
    landingVariant: state.landingVariant || 'l1'
  });
};
