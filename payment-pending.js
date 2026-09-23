document.addEventListener('DOMContentLoaded', () => {
  const storageKey = 'fitBeautyPendingPayment';
  const message = document.querySelector('#pending-message');
  const actions = document.querySelector('#pending-actions');
  const checkAgain = document.querySelector('#check-again');
  let timer = null;
  let checking = false;
  let cycleStartedAt = Date.now();

  const readPayment = () => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const returnedPayment = {
      orderReference: hash.get('order'),
      statusToken: hash.get('token'),
      createdAt: Date.now()
    };

    if (returnedPayment.orderReference && returnedPayment.statusToken) {
      sessionStorage.setItem(storageKey, JSON.stringify(returnedPayment));
      window.history.replaceState(null, '', window.location.pathname);
      return returnedPayment;
    }

    try {
      const payment = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
      return payment?.orderReference && payment?.statusToken ? payment : null;
    } catch { return null; }
  };

  const payment = readPayment();
  if (!payment) {
    message.textContent = 'Не вдалося знайти дані платежу. Якщо кошти списані, не проводь оплату повторно — напиши нам у підтримку.';
    actions.classList.add('is-visible');
    checkAgain.hidden = true;
    return;
  }

  const finish = (url) => { window.location.replace(url); };
  const schedule = (delay) => {
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(checkStatus, delay);
  };

  const checkStatus = async () => {
    if (checking) return;
    checking = true;

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

      if (response.ok && result.decision === 'confirmed') {
        finish(`thank-you.html?order=${encodeURIComponent(payment.orderReference)}`);
        return;
      }

      if (response.ok && result.decision === 'failed') {
        finish(`payment-error.html?reason=${encodeURIComponent(result.reason || result.transactionStatus || 'declined')}`);
        return;
      }

      if (response.ok && result.decision === 'waiting') {
        const remainingMs = Number(result.remainingMs || 0);
        if (remainingMs > 0) {
          const seconds = Math.max(1, Math.ceil(remainingMs / 1000));
          message.textContent = `Платіж отримано та перевіряється. Залишилось приблизно ${seconds} сек.`;
        } else {
          message.textContent = 'Очікуємо фінальне підтвердження оплати від WayForPay. Не закривай цю сторінку.';
        }
      }
    } catch {
      // Тимчасова мережева помилка — продовжуємо перевірку.
    } finally {
      checking = false;
    }

    const elapsed = Date.now() - cycleStartedAt;
    if (elapsed >= 300000) {
      message.textContent = 'Підтвердження займає більше часу. Якщо кошти вже списані, не проводь оплату повторно. Перевір статус ще раз або напиши нам у підтримку.';
      actions.classList.add('is-visible');
      return;
    }

    schedule(2000);
  };

  checkAgain.addEventListener('click', () => {
    actions.classList.remove('is-visible');
    message.textContent = 'Повторно перевіряємо підтвердження платежу…';
    cycleStartedAt = Date.now();
    checkStatus();
  });

  window.addEventListener('pageshow', () => { if (!checking) checkStatus(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !checking) checkStatus();
  });

  schedule(500);
});
