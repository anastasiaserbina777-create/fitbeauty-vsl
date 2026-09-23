document.addEventListener('DOMContentLoaded', async () => {
  const storageKey = 'fitBeautyPendingPayment';
  const message = document.querySelector('#thank-you-message');
  const courseLink = document.querySelector('#course-access-link');

  let payment = null;
  try { payment = JSON.parse(sessionStorage.getItem(storageKey) || 'null'); } catch {}

  const orderFromUrl = new URLSearchParams(location.search).get('order') || '';
  if (!payment?.orderReference || !payment?.statusToken || payment.orderReference !== orderFromUrl) {
    location.replace('payment-error.html?reason=invalid_order');
    return;
  }

  try {
    const response = await fetch('/api/payment-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderReference: payment.orderReference,
        statusToken: payment.statusToken
      })
    });
    const result = await response.json();

    if (!response.ok || result.decision !== 'confirmed' || !result.courseAccessUrl) {
      location.replace('payment-pending.html');
      return;
    }

    window.FitBeautyMeta?.trackPurchase?.({
      orderReference: payment.orderReference,
      eventId: result.purchaseEventId || `purchase_${payment.orderReference}`,
      amount: result.amount,
      currency: result.currency
    });

    courseLink.href = result.courseAccessUrl;
    courseLink.hidden = false;
    courseLink.dataset.courseAccess = '1';
    courseLink.dataset.telegramType = 'course';
    message.textContent = 'Твоя участь підтверджена. Натисни кнопку нижче, перейди до Telegram-бота та отримай доступ до матеріалів курсу.';
  } catch {
    location.replace('payment-pending.html');
  }
});
