const crypto = require('crypto');
const { observePayment } = require('./_lead-sync');
const { ensureServerPurchase } = require('./_purchase');

const sign = (value, secret) =>
  crypto.createHmac('md5', secret).update(value, 'utf8').digest('hex');

const safeEqual = (left, right) => {
  const a = Buffer.from(String(left || '').toLowerCase());
  const b = Buffer.from(String(right || '').toLowerCase());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

module.exports = async function wayforpayCallback(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const secretKey = process.env.WFP_MERCHANT_SECRET_KEY;
  const merchantAccount = process.env.WFP_MERCHANT_ACCOUNT;
  if (!secretKey || !merchantAccount) {
    return res.status(500).json({ message: 'Payment configuration is missing' });
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  } catch {
    return res.status(400).json({ message: 'Invalid JSON' });
  }

  const callbackSource = [
    body.merchantAccount,
    body.orderReference,
    body.amount,
    body.currency,
    body.authCode,
    body.cardPan,
    body.transactionStatus,
    body.reasonCode
  ].join(';');

  if (
    body.merchantAccount !== merchantAccount ||
    !safeEqual(body.merchantSignature, sign(callbackSource, secretKey))
  ) {
    return res.status(400).json({ message: 'Invalid signature' });
  }

  // Критично: спочатку синхронізуємо фактичний статус WayForPay у CRM.
  // Якщо Apps Script/CRM тимчасово недоступні, НЕ відповідаємо WayForPay "accept".
  // WayForPay повторює serviceUrl callback, тому статус не губиться.
  const observed = await observePayment({
    orderReference: body.orderReference,
    transactionStatus: body.transactionStatus,
    amount: body.amount,
    currency: body.currency,
    reason: body.reason,
    reasonCode: body.reasonCode
  });

  if (!observed || !observed.ok) {
    console.error('Payment state sync failed:', observed);
    return res.status(503).json({ message: 'Payment state sync failed' });
  }

  // Purchase у Meta відправляємо тільки після нашого confirmed-рішення
  // (тобто після 11-секундної стабілізації).
  if (observed.result && observed.result.decision === 'confirmed') {
    const purchase = await ensureServerPurchase(body.orderReference, observed.result.order, req);
    if (!purchase || !purchase.ok) {
      console.error('Meta Purchase sync failed:', purchase);
      return res.status(503).json({ message: 'Meta Purchase sync failed' });
    }
  }

  const time = Math.floor(Date.now() / 1000);
  const status = 'accept';
  const responseSignature = sign(`${body.orderReference};${status};${time}`, secretKey);

  return res.status(200).json({
    orderReference: body.orderReference,
    status,
    time,
    signature: responseSignature
  });
};
