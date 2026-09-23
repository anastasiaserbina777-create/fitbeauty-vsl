const crypto = require('crypto');
const { observePayment } = require('./_lead-sync');

const sign = (value, secret) => crypto.createHmac('md5', secret).update(value, 'utf8').digest('hex');
const createStatusToken = (orderReference, secret) => crypto.createHmac('sha256', secret).update(orderReference, 'utf8').digest('hex');
const safeEqual = (left, right) => {
  const a = Buffer.from(String(left || '').toLowerCase());
  const b = Buffer.from(String(right || '').toLowerCase());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

const parseBody = (body) => {
  if (body && typeof body === 'object') return body;
  if (typeof body !== 'string' || !body) return {};
  try { return JSON.parse(body); } catch { return Object.fromEntries(new URLSearchParams(body)); }
};

const redirect = (res, location) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Location', location);
  return res.status(303).end();
};

module.exports = async function paymentReturn(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).end();
  }

  const secretKey = process.env.WFP_MERCHANT_SECRET_KEY;
  const merchantAccount = process.env.WFP_MERCHANT_ACCOUNT;
  if (!secretKey || !merchantAccount) {
    return redirect(res, '/payment-error.html?reason=configuration');
  }

  const orderReference = String(req.query?.order || '');
  const statusToken = String(req.query?.token || '');
  const validOrder = /^FITBEAUTY-\d+-[a-f0-9]{8}$/.test(orderReference);
  const validToken = validOrder && safeEqual(statusToken, createStatusToken(orderReference, secretKey));
  if (!validToken) return redirect(res, '/payment-error.html?reason=invalid_return');

  const body = parseBody(req.body);
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

  const hasSignedResult = body.merchantAccount === merchantAccount
    && body.orderReference === orderReference
    && safeEqual(body.merchantSignature, sign(callbackSource, secretKey));

  const failedStatuses = new Set([
    'declined', 'expired', 'refunded', 'voided', 'withheld', 'cancelled', 'canceled'
  ]);
  const normalized = String(body.transactionStatus || '').trim().toLowerCase();

  // Якщо returnUrl приніс підписаний статус WayForPay — синхронізуємо CRM ДО редиректу.
  if (hasSignedResult && body.transactionStatus) {
    const observed = await observePayment({
      orderReference: body.orderReference,
      transactionStatus: body.transactionStatus,
      amount: body.amount,
      currency: body.currency,
      reason: body.reason,
      reasonCode: body.reasonCode
    });

    // Якщо CRM тимчасово недоступна, не показуємо фінальну сторінку навмання.
    // Pending-сторінка продовжить серверну CHECK_STATUS перевірку.
    if (!observed || !observed.ok) {
      console.error('Payment return sync failed:', observed);
      const pendingHash = `order=${encodeURIComponent(orderReference)}&token=${encodeURIComponent(statusToken)}`;
      return redirect(res, `/payment-pending.html#${pendingHash}`);
    }

    if (observed.result && observed.result.decision === 'failed') {
      return redirect(res, `/payment-error.html?reason=${encodeURIComponent(body.reason || body.transactionStatus)}`);
    }
  }

  // Відомий негативний статус безпечніше відправити на error,
  // але тільки після спроби синхронізації вище.
  if (hasSignedResult && failedStatuses.has(normalized)) {
    return redirect(res, `/payment-error.html?reason=${encodeURIComponent(body.reason || body.transactionStatus)}`);
  }

  // Approved/Pending/InProcessing НЕ ведуть напряму на thank-you.
  // Вони проходять нашу 11-секундну серверну стабілізацію на pending-сторінці.
  const pendingHash = `order=${encodeURIComponent(orderReference)}&token=${encodeURIComponent(statusToken)}`;
  return redirect(res, `/payment-pending.html#${pendingHash}`);
};
