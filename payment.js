document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('#payment-form');
  if (!form) return;

  const submitButton = form.querySelector('.payment-submit');
  const status = document.querySelector('#payment-status');
  let redirectStarted = false;
  let paymentLabel = '1290 грн';
  let activePayment = null;

  const applyPaymentLabel = (label) => {
    paymentLabel = label;
    document.querySelectorAll('[data-payment-amount]').forEach((element) => {
      element.textContent = label;
    });
  };

  fetch('/api/payment-config', { headers: { Accept: 'application/json' } })
    .then((response) => response.ok ? response.json() : Promise.reject())
    .then((config) => applyPaymentLabel(`${config.amount} грн`))
    .catch(() => {});

  const setStatus = (message) => { status.textContent = message; };
  const setLoading = (loading) => {
    submitButton.disabled = loading;
    submitButton.querySelector(':scope > span').textContent = loading
      ? 'Готуємо оплату…'
      : 'Отримати знижку';
  };

  const setFieldError = (name, message) => {
    const input = form.elements[name];
    const error = form.querySelector(`[data-error-for="${name}"]`);
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
    error.textContent = message;
  };

  const redirectTo = (url) => {
    if (redirectStarted) return;
    redirectStarted = true;
    window.location.assign(url);
  };

  const savePending = (payment) => {
    if (!payment?.orderReference || !payment?.statusToken) return;
    sessionStorage.setItem('fitBeautyPendingPayment', JSON.stringify({
      ...payment,
      createdAt: Date.now()
    }));
  };

  const redirectToPending = (payment) => {
    if (!payment?.orderReference || !payment?.statusToken || redirectStarted) return;
    savePending(payment);
    redirectTo('payment-pending.html');
  };

  const validate = (fullName, phone, email) => {
    let valid = true;
    const nameParts = fullName.trim().split(/\s+/).filter(Boolean);
    const phoneDigits = phone.replace(/\D/g, '');
    const normalizedEmail = email.trim().toLowerCase();

    if (nameParts.length < 2) { setFieldError('fullName', 'Вкажи ім’я та прізвище.'); valid = false; }
    else setFieldError('fullName', '');

    if (phoneDigits.length < 9 || phoneDigits.length > 13) { setFieldError('phone', 'Вкажи коректний номер телефону.'); valid = false; }
    else setFieldError('phone', '');

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) { setFieldError('email', 'Вкажи коректний email.'); valid = false; }
    else setFieldError('email', '');

    return { valid, phoneDigits, normalizedEmail };
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setStatus('');

    const fullName = form.elements.fullName.value;
    const phone = form.elements.phone.value;
    const email = form.elements.email.value;
    const validation = validate(fullName, phone, email);
    if (!validation.valid) return;

    window.FitBeautyMeta?.trackLead?.();

    if (typeof Wayforpay !== 'function') {
      setStatus('Платіжний модуль не завантажився. Онови сторінку та спробуй ще раз.');
      return;
    }

    setLoading(true);

    try {
      const tracking = window.FitBeautyMeta?.getBrowserData?.() || {};
      const response = await fetch('/api/create-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: fullName.trim(),
          phone: validation.phoneDigits,
          email: validation.normalizedEmail,
          ...tracking
        })
      });

      const result = await response.json();
      if (!response.ok || !result.payment) {
        throw new Error(result.message || 'Не вдалося створити платіж.');
      }

      activePayment = {
        orderReference: result.orderReference,
        statusToken: result.statusToken
      };
      savePending(activePayment);

      const wayforpay = new Wayforpay();
      setLoading(false);

      // Важливо: тут НЕ запускаємо фоновий CHECK_STATUS.
      // Поки користувач лише відкрив Apple Pay / Google Pay / карткову форму,
      // статус InProcessing не повинен викидати його з платіжного віджета.
      const syncVerifiedStatusAndRoute = async (fallbackReason = 'declined') => {
        if (!activePayment || redirectStarted) return;

        try {
          const statusResponse = await fetch('/api/payment-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              orderReference: activePayment.orderReference,
              statusToken: activePayment.statusToken
            })
          });
          const statusResult = await statusResponse.json();

          if (statusResponse.ok && statusResult.decision === 'failed') {
            redirectTo(`payment-error.html?reason=${encodeURIComponent(statusResult.reason || statusResult.transactionStatus || fallbackReason)}`);
            return;
          }

          if (statusResponse.ok && (statusResult.decision === 'waiting' || statusResult.decision === 'confirmed')) {
            redirectToPending(activePayment);
            return;
          }
        } catch (_) {
          // Якщо перевірка тимчасово недоступна, pending-сторінка повторить серверний CHECK_STATUS.
        }

        redirectToPending(activePayment);
      };

      wayforpay.run(
        result.payment,
        () => redirectToPending(activePayment),
        (declined) => syncVerifiedStatusAndRoute(declined?.reason || 'declined'),
        () => redirectToPending(activePayment)
      );

      window.FitBeautyMeta?.trackPaymentWidgetOpen?.(result.orderReference);
    } catch (error) {
      setLoading(false);
      setStatus(error.message || 'Сталася помилка. Спробуй ще раз або напиши в підтримку.');
    }
  });

  window.addEventListener('message', (event) => {
    if (event.origin !== 'https://secure.wayforpay.com' || !activePayment) return;

    if (event.data === 'WfpWidgetEventApproved' || event.data === 'WfpWidgetEventPending') {
      redirectToPending(activePayment);
    }
    if (event.data === 'WfpWidgetEventDeclined') {
      // Не довіряємо лише браузерній події: сервер сам перевіряє WayForPay
      // і синхронізує Google Sheets/Telegram перед переходом на помилку.
      fetch('/api/payment-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderReference: activePayment.orderReference,
          statusToken: activePayment.statusToken
        })
      })
        .then((response) => response.json().then((data) => ({ ok: response.ok, data })))
        .then(({ ok, data }) => {
          if (redirectStarted) return;
          if (ok && data.decision === 'failed') {
            redirectTo(`payment-error.html?reason=${encodeURIComponent(data.reason || data.transactionStatus || 'declined')}`);
          } else {
            redirectToPending(activePayment);
          }
        })
        .catch(() => redirectToPending(activePayment));
    }
    if (event.data === 'WfpWidgetEventClose') {
      setLoading(false);
    }
  });
});
