async function postIntegration(payload) {
  const integrationUrl = process.env.LEADS_INTEGRATION_URL;
  const integrationKey = process.env.LEADS_INTEGRATION_KEY;

  if (!integrationUrl || !integrationKey) {
    return { ok: false, reason: 'not_configured' };
  }

  try {
    const response = await fetch(
      `${integrationUrl}?key=${encodeURIComponent(integrationKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }
    );

    const text = await response.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch { parsed = null; }

    if (!response.ok || !parsed || parsed.status !== 'ok') {
      console.error('Order state integration error:', response.status, text);
      return { ok: false, status: response.status, body: text };
    }

    return { ok: true, result: parsed.result };
  } catch (error) {
    console.error('Order state integration request failed:', error);
    return { ok: false, reason: 'request_failed', message: error.message };
  }
}

const observePayment = (data) => postIntegration({ event: 'payment_observed', ...data });
const completePurchase = (data) => postIntegration({ event: 'purchase_complete', ...data });
const markPurchaseRetry = (data) => postIntegration({ event: 'purchase_retry', ...data });
const getOrderState = (orderReference) => postIntegration({ event: 'order_state', orderReference });

module.exports = {
  observePayment,
  completePurchase,
  markPurchaseRetry,
  getOrderState
};
