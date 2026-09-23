const crypto = require('crypto');

const CURRENCY = 'UAH';
const PRODUCT_NAME = 'Fit Beauty — 30-денна програма';

const sign = (value, secret) => crypto.createHmac('md5', secret).update(value, 'utf8').digest('hex');
const createStatusToken = (orderReference, secret) => crypto.createHmac('sha256', secret).update(orderReference, 'utf8').digest('hex');

module.exports = async function createPayment(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const merchantAccount = process.env.WFP_MERCHANT_ACCOUNT;
  const secretKey = process.env.WFP_MERCHANT_SECRET_KEY;
  const amount = String(process.env.WFP_AMOUNT || '1290').trim();
  const siteUrl = (process.env.SITE_URL || '').replace(/\/$/, '');
  const merchantDomainName = process.env.WFP_MERCHANT_DOMAIN || (() => {
    try { return new URL(siteUrl).hostname; } catch { return ''; }
  })();

  if (!merchantAccount || !secretKey || !siteUrl || !merchantDomainName || !/^\d+(?:\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) {
    return res.status(500).json({ message: 'Платіж тимчасово недоступний. Напишіть у підтримку.' });
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  } catch {
    return res.status(400).json({ message: 'Некоректні дані форми.' });
  }
  const fullName = String(body.fullName || '').trim().replace(/\s+/g, ' ');
  const phone = String(body.phone || '').replace(/\D/g, '');
  const email = String(body.email || '').trim().toLowerCase();
  const nameParts = fullName.split(' ').filter(Boolean);

  if (nameParts.length < 2 || phone.length < 9 || phone.length > 13 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: 'Перевірте ім’я, прізвище, номер телефону та email.' });
  }

  const clientFirstName = nameParts.shift();
  const clientLastName = nameParts.join(' ');
  const orderDate = Math.floor(Date.now() / 1000);
  const orderReference = `FITBEAUTY-${orderDate}-${crypto.randomBytes(4).toString('hex')}`;
  const productName = [PRODUCT_NAME];
  const productCount = ['1'];
  const productPrice = [amount];
  const statusToken = createStatusToken(orderReference, secretKey);
  const signatureSource = [
    merchantAccount,
    merchantDomainName,
    orderReference,
    String(orderDate),
    amount,
    CURRENCY,
    ...productName,
    ...productCount,
    ...productPrice
  ].join(';');

  const payment = {
    merchantAccount,
    merchantDomainName,
    merchantAuthType: 'SimpleSignature',
    merchantSignature: sign(signatureSource, secretKey),
    orderReference,
    orderDate,
    amount,
    currency: CURRENCY,
    productName,
    productPrice,
    productCount,
    clientFirstName,
    clientLastName,
    clientPhone: phone,
    clientEmail: email,
    language: 'UA',
    merchantTransactionType: 'AUTO',
    merchantTransactionSecureType: 'AUTO',
    paymentSystems: 'card;googlePay;applePay',
    returnUrl: `${siteUrl}/api/payment-return?order=${encodeURIComponent(orderReference)}&token=${encodeURIComponent(statusToken)}`,
    serviceUrl: `${siteUrl}/api/wayforpay-callback`,
  };

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    payment,
    orderReference,
    amount,
    statusToken
  });
};
