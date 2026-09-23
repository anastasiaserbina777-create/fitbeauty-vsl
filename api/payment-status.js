const crypto = require('crypto');
const { observePayment } = require('./_lead-sync');
const { ensureServerPurchase } = require('./_purchase');

const sign = (value, secret) =>
  crypto.createHmac('md5', secret).update(value, 'utf8').digest('hex');

const createStatusToken = (orderReference, secret) =>
  crypto.createHmac('sha256', secret).update(orderReference, 'utf8').digest('hex');

const safeEqual = (left, right) => {
  const a = Buffer.from(String(left || '').toLowerCase());
  const b = Buffer.from(String(right || '').toLowerCase());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
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

  if (
    !/^FITBEAUTY-\d+-[a-f0-9]{8}$/.test(orderReference) ||
    !safeEqual(statusToken, createStatusToken(orderReference, secretKey))
  ) {
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

    if (
      result.merchantAccount !== merchantAccount ||
      result.orderReference !== orderReference ||
      !safeEqual(result.merchantSignature, sign(responseSource, secretKey))
    ) {
      return res.status(502).json({ message: 'Invalid WayForPay response signature' });
    }

    const observed = await observePayment({
      orderReference: result.orderReference,
      transactionStatus: result.transactionStatus,
      amount: result.amount,
      currency: result.currency,
      reason: result.reason,
      reasonCode: result.reasonCode
    });

    if (!observed || !observed.ok) {
      console.error('Payment state sync failed:', observed);
      return res.status(502).json({ message: 'Payment state sync failed' });
    }

    const state = observed.result || {};
    let purchaseEventId = '';

    if (state.decision === 'confirmed') {
      const purchase = await ensureServerPurchase(orderReference, state.order, req);
      purchaseEventId = purchase.eventId || `purchase_${orderReference}`;
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      transactionStatus: result.transactionStatus,
      reason: result.reason || '',
      reasonCode: result.reasonCode,
      decision: state.decision || 'new',
      remainingMs: Number(state.remainingMs || 0),
      purchaseEventId: state.decision === 'confirmed' ? (purchaseEventId || `purchase_${orderReference}`) : '',
      amount: state.order ? state.order.amount : result.amount,
      currency: state.order ? state.order.currency : result.currency,
      landing_variant: state.order ? state.order.landing_variant : 'l1',
      courseAccessUrl: state.decision === 'confirmed' ? (process.env.COURSE_ACCESS_URL || '') : ''
    });
  } catch (error) {
    return res.status(502).json({
      message: error.name === 'AbortError' ? 'WayForPay timeout' : 'WayForPay status request failed'
    });
  } finally {
    clearTimeout(timeout);
  }
};
