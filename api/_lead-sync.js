async function sendToLeadWebhook(payload) {
  const webhookUrl = process.env.LEADS_INTEGRATION_URL;
  const webhookSecret = process.env.LEADS_INTEGRATION_KEY;

  if (!webhookUrl || !webhookSecret) {
    console.error('Lead webhook is not configured');
    return { ok: false, reason: 'not_configured' };
  }

  try {
    const response = await fetch(
      `${webhookUrl}?key=${encodeURIComponent(webhookSecret)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }
    );

    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}

    if (!response.ok || !json || json.status !== 'ok') {
      console.error('Lead webhook error:', response.status, text);
      return { ok: false, status: response.status, body: text };
    }

    return { ok: true, result: json.result, body: text };
  } catch (error) {
    console.error('Lead webhook request failed:', error);
    return { ok: false, reason: 'request_failed', message: error.message };
  }
}

async function createInitialLead(data) {
  return sendToLeadWebhook({ event: 'order_created', ...data });
}

async function observePayment(data) {
  return sendToLeadWebhook({ event: 'payment_observed', ...data });
}

async function getOrderState(orderReference) {
  return sendToLeadWebhook({ event: 'get_order_state', orderReference });
}

async function claimMetaPurchase(orderReference) {
  return sendToLeadWebhook({ event: 'claim_meta_purchase', orderReference });
}

async function markMetaPurchase(orderReference, sent) {
  return sendToLeadWebhook({ event: 'mark_meta_purchase', orderReference, sent: Boolean(sent) });
}

module.exports = {
  createInitialLead,
  observePayment,
  getOrderState,
  claimMetaPurchase,
  markMetaPurchase
};
