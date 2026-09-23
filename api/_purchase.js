const { claimMetaPurchase, markMetaPurchase } = require('./_lead-sync');
const { sendMetaEvent } = require('./_meta');

async function ensureServerPurchase(orderReference, order, req) {
  const claim = await claimMetaPurchase(orderReference);
  if (!claim || !claim.ok) return { ok: false, reason: 'claim_failed' };

  const claimResult = claim.result || {};
  if (!claimResult.claimed) {
    return {
      ok: true,
      skipped: true,
      state: claimResult.status || 'not_claimed'
    };
  }

  const confirmedOrder = claimResult.order || order || {};
  const eventId = `purchase_${orderReference}`;

  const result = await sendMetaEvent({
    eventName: 'Purchase',
    eventId,
    eventSourceUrl: confirmedOrder.source_url || process.env.SITE_URL || '',
    landingVariant: confirmedOrder.landing_variant || 'l1',
    customData: {
      content_ids: ['fit_beauty_30'],
      content_name: 'Fit Beauty',
      content_type: 'product',
      currency: confirmedOrder.currency || 'UAH',
      value: Number(confirmedOrder.amount || 0),
      order_reference: orderReference
    },
    userData: {
      email: confirmedOrder.email,
      phone: confirmedOrder.phone,
      fbp: confirmedOrder.fbp,
      fbc: confirmedOrder.fbc,
      ip: confirmedOrder.ip,
      userAgent: confirmedOrder.user_agent
    },
    req
  });

  await markMetaPurchase(orderReference, result.ok);

  return {
    ok: result.ok,
    eventId,
    meta: result
  };
}

module.exports = { ensureServerPurchase };
