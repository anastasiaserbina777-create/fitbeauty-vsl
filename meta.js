(() => {
  const PIXEL_ID = '1632037078438891';
  const PRODUCT = {
    content_ids: ['fit_beauty_30'],
    content_name: 'Fit Beauty',
    content_type: 'product',
    currency: 'UAH'
  };

  const host = location.hostname.toLowerCase();
  const landingVariant = host.startsWith('l2.') ? 'l2' : host.startsWith('l3.') ? 'l3' : 'l1';

  const uid = (prefix) => {
    if (crypto && crypto.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  };

  const cookie = (name) => {
    const prefix = `${name}=`;
    const item = document.cookie.split(';').map(v => v.trim()).find(v => v.startsWith(prefix));
    return item ? decodeURIComponent(item.slice(prefix.length)) : '';
  };

  const captureAttribution = () => {
    const params = new URLSearchParams(location.search);
    const current = {
      utm_source: params.get('utm_source') || '',
      utm_medium: params.get('utm_medium') || '',
      utm_campaign: params.get('utm_campaign') || '',
      utm_content: params.get('utm_content') || '',
      utm_term: params.get('utm_term') || '',
      source_url: location.href
    };

    let saved = {};
    try { saved = JSON.parse(sessionStorage.getItem('fitBeautyAttribution') || '{}'); } catch {}
    const merged = { ...saved };
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach((key) => {
      if (current[key]) merged[key] = current[key];
    });
    if (!merged.source_url) merged.source_url = location.href;
    sessionStorage.setItem('fitBeautyAttribution', JSON.stringify(merged));
    return merged;
  };

  const attribution = captureAttribution();

  // Meta Pixel base code.
  if (!window.fbq) {
    /* eslint-disable */
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
    n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window, document,'script',
    'https://connect.facebook.net/en_US/fbevents.js');
    /* eslint-enable */
    fbq('init', PIXEL_ID);
  }

  const sendCapi = async (eventName, eventId, customData = {}) => {
    try {
      await fetch('/api/meta-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
        body: JSON.stringify({
          eventName,
          eventId,
          eventSourceUrl: location.href,
          landing_variant: landingVariant,
          customData,
          fbp: cookie('_fbp'),
          fbc: cookie('_fbc')
        })
      });
    } catch {}
  };

  const standardPair = (eventName, eventId, data = {}) => {
    fbq('track', eventName, data, { eventID: eventId });
    window.setTimeout(() => sendCapi(eventName, eventId, data), 100);
  };

  const pageViewId = uid('pageview');
  standardPair('PageView', pageViewId, { landing_variant: landingVariant });

  const path = location.pathname.replace(/\/+$/, '') || '/';
  const isMainLanding = path === '/' || path.endsWith('/index.html');

  if (isMainLanding) {
    fetch('/api/payment-config')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(config => {
        const eventId = uid('viewcontent');
        standardPair('ViewContent', eventId, {
          ...PRODUCT,
          value: Number(config.amount || 0),
          landing_variant: landingVariant
        });
      })
      .catch(() => {});
  }

  if (path.endsWith('/checkout.html')) {
    const params = new URLSearchParams(location.search);
    if (params.get('new_attempt') === '1') {
      sessionStorage.removeItem('fitBeautyCheckoutAttemptId');
      sessionStorage.removeItem('fitBeautyInitiateCheckoutSent');
      history.replaceState(null, '', 'checkout.html');
    }

    let attemptId = sessionStorage.getItem('fitBeautyCheckoutAttemptId');
    if (!attemptId) {
      attemptId = uid('checkout_attempt');
      sessionStorage.setItem('fitBeautyCheckoutAttemptId', attemptId);
    }

    if (!sessionStorage.getItem('fitBeautyInitiateCheckoutSent')) {
      fetch('/api/payment-config')
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(config => {
          const eventId = `initiate_${attemptId}`;
          standardPair('InitiateCheckout', eventId, {
            ...PRODUCT,
            value: Number(config.amount || 0),
            landing_variant: landingVariant,
            checkout_attempt_id: attemptId
          });
          sessionStorage.setItem('fitBeautyInitiateCheckoutSent', '1');
        })
        .catch(() => {});
    }

    let formStarted = false;
    document.addEventListener('input', (event) => {
      if (formStarted || !event.isTrusted || !event.target.closest('#payment-form')) return;
      formStarted = true;
      fbq('trackCustom', 'PaymentFormStart', {
        landing_variant: landingVariant,
        checkout_attempt_id: attemptId
      });
    }, true);
  }

  document.addEventListener('click', (event) => {
    const buy = event.target.closest('a[href*="checkout.html"][data-buy-location]');
    if (buy) {
      fbq('trackCustom', 'BuyButtonClick', {
        landing_variant: landingVariant,
        button_location: buy.dataset.buyLocation
      });
    }

    const telegram = event.target.closest('a[href^="https://t.me/"]');
    if (telegram) {
      const linkType = telegram.dataset.telegramType || (telegram.dataset.courseAccess === '1' ? 'course' : 'support');
      fbq('trackCustom', 'TelegramClick', {
        landing_variant: landingVariant,
        link_type: linkType
      });
    }
  });

  window.FitBeautyMeta = {
    landingVariant,
    attribution,
    getBrowserData() {
      return {
        ...attribution,
        fbp: cookie('_fbp'),
        fbc: cookie('_fbc')
      };
    },
    trackLead() {
      const attemptId = sessionStorage.getItem('fitBeautyCheckoutAttemptId') || 'unknown';
      const key = `fitBeautyLeadSent_${attemptId}`;
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
      fbq('track', 'Lead', {
        content_name: PRODUCT.content_name,
        landing_variant: landingVariant,
        checkout_attempt_id: attemptId
      });
    },
    trackPaymentWidgetOpen(orderReference) {
      const key = `fitBeautyWidgetOpen_${orderReference}`;
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
      fbq('trackCustom', 'PaymentWidgetOpen', {
        landing_variant: landingVariant,
        order_reference: orderReference
      });
    },
    trackPurchase({ orderReference, eventId, amount, currency }) {
      if (!orderReference || !eventId) return;
      const key = `fitBeautyBrowserPurchase_${orderReference}`;
      if (localStorage.getItem(key)) return;
      fbq('track', 'Purchase', {
        ...PRODUCT,
        value: Number(amount || 0),
        currency: currency || 'UAH',
        order_reference: orderReference,
        landing_variant: landingVariant
      }, { eventID: eventId });
      localStorage.setItem(key, '1');
    }
  };
})();
