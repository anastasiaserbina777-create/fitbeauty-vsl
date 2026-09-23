const { sendMetaEvent } = require('./_meta');
const {
  observePayment,
  completePurchase,
  markPurchaseRetry
} = require('./_order-state');

// WayForPay may report a payment as InProcessing before it becomes Approved.
// All processing/positive states must survive the same 11-second stabilization window.
const POSITIVE = new Set(['Approved', 'Pending', 'InProcessing']);
const FAILED = new Set(['Declined', 'Expired', 'Refunded', 'Voided']);

async function processVerifiedPayment({ result, req }) {
  const transactionStatus = String(result.transactionStatus || '');

  const observed = await observePayment({
    orderReference: result.orderReference,
    transactionStatus,
    amount: result.amount,
    currency: result.currency,
    reason: result.reason || '',
    reasonCode: result.reasonCode || ''
  });

  if (!observed.ok) {
    return {
      ok: false,
      transactionStatus,
      confirmed: false,
      stateUnavailable: true
    };
  }

  const state = observed.result || {};

  if (FAILED.has(transactionStatus)) {
    return {
      ok: true,
      transactionStatus,
      confirmed: false,
      failed: true,
      reason: result.reason || '',
      reasonCode: result.reasonCode || ''
    };
  }

  if (!POSITIVE.has(transactionStatus)) {
    return {
      ok: true,
      transactionStatus,
      confirmed: false,
      pending: true
    };
  }

  if (state.confirmed || state.purchaseState === 'sent') {
    return {
      ok: true,
      transactionStatus,
      confirmed: true,
      purchaseEventId: state.purchaseEventId,
      amount: state.amount || result.amount,
      currency: state.currency || result.currency
    };
  }

  if (!state.claimGranted) {
    return {
      ok: true,
      transactionStatus,
      confirmed: false,
      stabilizing: true,
      retryAfterMs: state.retryAfterMs || 2500
    };
  }

  const purchaseEventId = state.purchaseEventId || `purchase_${result.orderReference}`;
  const eventSourceUrl = state.site
    ? `https://${String(state.site).replace(/^https?:\/\//, '')}/payment-pending.html`
    : String(process.env.SITE_URL || '').replace(/\/$/, '') + '/payment-pending.html';

  const metaResult = await sendMetaEvent({
    eventName: 'Purchase',
    eventId: purchaseEventId,
    eventSourceUrl,
    customData: {
      content_ids: ['fit_beauty_30'],
      content_name: 'Fit Beauty',
      content_type: 'product',
      currency: result.currency,
      value: Number(result.amount),
      order_reference: result.orderReference,
      landing_variant: state.landingVariant || 'l1'
    },
    userData: {
      email: state.email,
      phone: state.phone,
      fbp: state.fbp,
      fbc: state.fbc,
      client_ip_address: state.clientIp,
      client_user_agent: state.userAgent
    },
    req
  });

  if (!metaResult.ok) {
    await markPurchaseRetry({
      orderReference: result.orderReference,
      purchaseEventId
    });

    return {
      ok: false,
      transactionStatus,
      confirmed: false,
      metaFailed: true,
      retryAfterMs: 3000
    };
  }

  const completed = await completePurchase({
    orderReference: result.orderReference,
    purchaseEventId,
    transactionStatus,
    amount: result.amount,
    currency: result.currency,
    reason: result.reason || '',
    reasonCode: result.reasonCode || ''
  });

  if (!completed.ok) {
    return {
      ok: false,
      transactionStatus,
      confirmed: false,
      stateUnavailable: true
    };
  }

  return {
    ok: true,
    transactionStatus,
    confirmed: true,
    purchaseEventId,
    amount: result.amount,
    currency: result.currency
  };
}

module.exports = { processVerifiedPayment };
