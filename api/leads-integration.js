async function postToLeadsIntegration(payload) {
  const integrationUrl = process.env.LEADS_INTEGRATION_URL;
  const integrationKey = process.env.LEADS_INTEGRATION_KEY;

  if (!integrationUrl || !integrationKey) {
    console.warn('Leads integration is not configured');
    return {
      ok: false,
      reason: 'not_configured'
    };
  }

  try {
    const response = await fetch(
      `${integrationUrl}?key=${encodeURIComponent(integrationKey)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      }
    );

    const text = await response.text();

    if (!response.ok) {
      console.error('Leads integration HTTP error:', response.status, text);
      return {
        ok: false,
        status: response.status,
        body: text
      };
    }

    let data = null;

    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    return {
      ok: true,
      data
    };
  } catch (error) {
    console.error('Leads integration request failed:', error);

    return {
      ok: false,
      reason: 'request_failed',
      message: error.message
    };
  }
}

async function sendLeadCreated({
  fullName,
  phone,
  email,
  orderReference,
  amount,
  product,
  page,
  source,
  utm
}) {
  return postToLeadsIntegration({
    event: 'lead_created',
    fullName,
    phone,
    email,
    orderReference,
    amount,
    product,
    page,
    source,
    utm
  });
}

async function sendPaymentUpdate({
  orderReference,
  transactionStatus,
  amount,
  reason,
  reasonCode
}) {
  return postToLeadsIntegration({
    event: 'payment_update',
    orderReference,
    transactionStatus,
    amount,
    reason,
    reasonCode
  });
}

module.exports = {
  sendLeadCreated,
  sendPaymentUpdate
};
