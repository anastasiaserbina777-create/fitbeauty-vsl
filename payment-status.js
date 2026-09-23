const crypto = require('crypto');

const sign = (value, secret) => crypto.createHmac('md5', secret).update(value, 'utf8').digest('hex');
const createStatusToken = (orderReference, secret) => crypto.createHmac('sha256', secret).update(orderReference, 'utf8').digest('hex');
const safeEqual = (left, right) => {
  const leftBuffer = Buffer.from(String(left || '').toLowerCase());
  const rightBuffer = Buffer.from(String(right || '').toLowerCase());
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

module.exports = async function paymentStatus(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const merchantAccount = process.env.WFP_MERCHANT_ACCOUNT;
  const secretKey = process.env.WFP_MERCHANT_SECRET_KEY;
  if (!merchantAccount || !secretKey) {
    return res.status(500).json({ message: 'Payment configuration is missing' });
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  } catch {
    return res.status(400).json({ message: 'Invalid JSON' });
  }

  const orderReference = String(body.orderReference || '');
  const statusToken = String(body.statusToken || '');
  if (!/^FITBEAUTY-\d+-[a-f0-9]{8}$/.test(orderReference) || !safeEqual(statusToken, createStatusToken(orderReference, secretKey))) {
    return res.status(400).json({ message: 'Invalid order' });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const wayforpayResponse = await fetch('https://api.wayforpay.com/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transactionType: 'CHECK_STATUS',
        merchantAccount,
        orderReference,
        merchantSignature: sign(`${merchantAccount};${orderReference}`, secretKey),
        apiVersion: 1
      }),
      signal: controller.signal
    });
    const result = await wayforpayResponse.json();

    if (!wayforpayResponse.ok) {
      return res.status(502).json({ message: 'WayForPay status request failed' });
    }

    const responseSource = [
      result.merchantAccount,
      result.orderReference,
      result.amount,
      result.currency,
      result.authCode,
      result.cardPan,
      result.transactionStatus,
      result.reasonCode
    ].join(';');

    if (result.merchantAccount !== merchantAccount || result.orderReference !== orderReference || !safeEqual(result.merchantSignature, sign(responseSource, secretKey))) {
      return res.status(502).json({ message: 'Invalid WayForPay response signature' });
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      transactionStatus: result.transactionStatus,
      reason: result.reason || '',
      reasonCode: result.reasonCode
    });
  } catch (error) {
    return res.status(502).json({ message: error.name === 'AbortError' ? 'WayForPay timeout' : 'WayForPay status request failed' });
  } finally {
    clearTimeout(timeout);
  }
};
