const crypto = require('crypto');

const PIXEL_ID = '1632037078438891';

const sha256 = (value) =>
  crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const normalizePhone = (value) => String(value || '').replace(/\D/g, '');

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (Array.isArray(forwarded)) return forwarded[0] || '';
  return String(forwarded || '').split(',')[0].trim();
}

function inferVariant(host) {
  const normalized = String(host || '').toLowerCase().split(':')[0];
  if (normalized.startsWith('l2.')) return 'l2';
  if (normalized.startsWith('l3.')) return 'l3';
  return 'l1';
}

async function sendMetaEvent({
  eventName,
  eventId,
  eventSourceUrl,
  landingVariant,
  customData = {},
  userData = {},
  req
}) {
  const token = process.env.META_CAPI_ACCESS_TOKEN;
  const version = process.env.META_GRAPH_API_VERSION || 'v23.0';
  if (!token) return { ok: false, reason: 'meta_token_missing' };

  const normalizedUserData = {};
  const email = normalizeEmail(userData.email);
  const phone = normalizePhone(userData.phone);
  if (email) normalizedUserData.em = [sha256(email)];
  if (phone) normalizedUserData.ph = [sha256(phone)];
  if (userData.fbp) normalizedUserData.fbp = String(userData.fbp);
  if (userData.fbc) normalizedUserData.fbc = String(userData.fbc);
  if (userData.ip || req) normalizedUserData.client_ip_address = userData.ip || getClientIp(req);
  if (userData.userAgent || req) normalizedUserData.client_user_agent = userData.userAgent || String(req.headers['user-agent'] || '');

  const payload = {
    data: [{
      event_name: eventName,
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventId,
      action_source: 'website',
      event_source_url: eventSourceUrl,
      user_data: normalizedUserData,
      custom_data: {
        ...customData,
        landing_variant: landingVariant
      }
    }]
  };

  if (process.env.META_TEST_EVENT_CODE) {
    payload.test_event_code = process.env.META_TEST_EVENT_CODE;
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/${version}/${PIXEL_ID}/events?access_token=${encodeURIComponent(token)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }
    );
    const body = await response.text();
    return { ok: response.ok, status: response.status, body };
  } catch (error) {
    return { ok: false, reason: 'request_failed', message: error.message };
  }
}

module.exports = { PIXEL_ID, sendMetaEvent, inferVariant, getClientIp };
