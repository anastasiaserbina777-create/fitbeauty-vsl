var SPREADSHEET_ID = '12_G1qNDjZVQdIxLg1mISBL0dW3Qgbbm210nNQ2NuT4w';
var SHEET_NAME = 'Leads';
var TELEGRAM_CHAT_ID = '-5112296043';
var STABILIZATION_MS = 11000;
var SENDING_STALE_MS = 30000;

var HEADERS = [
  'Дата створення',
  'Імʼя',
  'Телефон / Telegram @',
  'Email',
  'Статус оплати',
  'Сайт',
  'Сума',
  'Валюта',
  'Order ID',
  'Статус WayForPay',
  'Причина',
  'Продукт',
  'Оновлено',
  'Landing Variant',
  'UTM Source',
  'UTM Medium',
  'UTM Campaign',
  'UTM Content',
  'UTM Term',
  'Source URL',
  '_fbp',
  '_fbc',
  'Client IP',
  'User-Agent',
  'Checkout Attempt ID',
  'First Positive At',
  'Purchase State',
  'Purchase Event ID',
  'Purchase Confirmed At',
  'Purchase State Updated At'
];

function safeText_(value) {
  return value === undefined || value === null ? '' : String(value);
}

function getTelegramToken_() {
  return PropertiesService.getScriptProperties().getProperty('TELEGRAM_TOKEN');
}

function getIntegrationKey_() {
  return PropertiesService.getScriptProperties().getProperty('INTEGRATION_KEY');
}

function getSheet_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  sheet.setFrozenRows(1);
  return sheet;
}

function col_(name) {
  return HEADERS.indexOf(name) + 1;
}

function get_(sheet, row, name) {
  return sheet.getRange(row, col_(name)).getValue();
}

function set_(sheet, row, name, value) {
  sheet.getRange(row, col_(name)).setValue(value);
}

function findOrderRow_(sheet, orderReference) {
  if (!orderReference || sheet.getLastRow() < 2) return -1;
  var column = col_('Order ID');
  var values = sheet.getRange(2, column, sheet.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    if (safeText_(values[i][0]) === safeText_(orderReference)) return i + 2;
  }
  return -1;
}

function isPositive_(status) {
  // InProcessing is also a real payment-processing state and must enter the same 11s stabilization window.
  return status === 'Approved' || status === 'Pending' || status === 'InProcessing';
}


function isFailed_(status) {
  return status === 'Declined' || status === 'Expired' || status === 'Refunded' || status === 'Voided';
}

function sendTelegram_(text) {
  var token = getTelegramToken_();
  if (!token || !TELEGRAM_CHAT_ID) return { ok: false, reason: 'telegram_not_configured' };
  try {
    var response = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: text,
        disable_web_page_preview: true
      }),
      muteHttpExceptions: true
    });
    return {
      ok: response.getResponseCode() >= 200 && response.getResponseCode() < 300,
      code: response.getResponseCode(),
      body: response.getContentText()
    };
  } catch (error) {
    return { ok: false, reason: String(error) };
  }
}

function createOrder_(data) {
  var sheet = getSheet_();
  var orderReference = safeText_(data.orderReference);
  if (!orderReference) throw new Error('orderReference is required');

  var existingRow = findOrderRow_(sheet, orderReference);
  if (existingRow !== -1) return { status: 'exists', row: existingRow };

  var row = new Array(HEADERS.length).fill('');
  row[col_('Дата створення') - 1] = new Date();
  row[col_('Імʼя') - 1] = safeText_(data.fullName || data.name);
  row[col_('Телефон / Telegram @') - 1] = safeText_(data.phone || data.contact);
  row[col_('Email') - 1] = safeText_(data.email);
  row[col_('Статус оплати') - 1] = 'Без спроби оплати';
  row[col_('Сайт') - 1] = safeText_(data.site || data.source);
  row[col_('Сума') - 1] = safeText_(data.amount);
  row[col_('Валюта') - 1] = safeText_(data.currency || 'UAH');
  row[col_('Order ID') - 1] = orderReference;
  row[col_('Продукт') - 1] = safeText_(data.product);
  row[col_('Оновлено') - 1] = new Date();
  row[col_('Landing Variant') - 1] = safeText_(data.landing_variant);
  row[col_('UTM Source') - 1] = safeText_(data.utm_source);
  row[col_('UTM Medium') - 1] = safeText_(data.utm_medium);
  row[col_('UTM Campaign') - 1] = safeText_(data.utm_campaign);
  row[col_('UTM Content') - 1] = safeText_(data.utm_content);
  row[col_('UTM Term') - 1] = safeText_(data.utm_term);
  row[col_('Source URL') - 1] = safeText_(data.source_url);
  row[col_('_fbp') - 1] = safeText_(data.fbp);
  row[col_('_fbc') - 1] = safeText_(data.fbc);
  row[col_('Client IP') - 1] = safeText_(data.client_ip);
  row[col_('User-Agent') - 1] = safeText_(data.user_agent);
  row[col_('Checkout Attempt ID') - 1] = safeText_(data.checkout_attempt_id);

  sheet.appendRow(row);
  return { status: 'created', orderReference: orderReference };
}

function sendPaymentTelegram_(sheet, row, success) {
  var name = safeText_(get_(sheet, row, 'Імʼя'));
  var contact = safeText_(get_(sheet, row, 'Телефон / Telegram @'));
  var email = safeText_(get_(sheet, row, 'Email'));
  var site = safeText_(get_(sheet, row, 'Сайт'));
  var amount = safeText_(get_(sheet, row, 'Сума'));
  var currency = safeText_(get_(sheet, row, 'Валюта'));
  var product = safeText_(get_(sheet, row, 'Продукт'));
  var orderReference = safeText_(get_(sheet, row, 'Order ID'));
  var transactionStatus = safeText_(get_(sheet, row, 'Статус WayForPay'));
  var reason = safeText_(get_(sheet, row, 'Причина'));
  var landing = safeText_(get_(sheet, row, 'Landing Variant'));

  var lines = [
    success ? '✅ ОПЛАТА УСПІШНА' : '❌ ОПЛАТА НЕУСПІШНА',
    '',
    'Імʼя: ' + name,
    'Контакт: ' + contact,
    'Email: ' + email,
    'Продукт: ' + product,
    'Сума: ' + amount + ' ' + currency,
    'Сайт: ' + site,
    'Landing: ' + landing
  ];

  if (!success) lines.push('Причина: ' + reason);
  lines.push('Замовлення: ' + orderReference);
  lines.push('Статус WayForPay: ' + transactionStatus);
  sendTelegram_(lines.join('\n'));
}

function paymentObserved_(data) {
  var sheet = getSheet_();
  var orderReference = safeText_(data.orderReference);
  var status = safeText_(data.transactionStatus);
  var row = findOrderRow_(sheet, orderReference);
  if (row === -1) return { status: 'order_not_found', orderReference: orderReference };

  var now = new Date();
  var previousBusinessStatus = safeText_(get_(sheet, row, 'Статус оплати'));

  if (data.amount !== undefined && data.amount !== null && data.amount !== '') set_(sheet, row, 'Сума', data.amount);
  if (data.currency) set_(sheet, row, 'Валюта', safeText_(data.currency));
  set_(sheet, row, 'Статус WayForPay', status);
  set_(sheet, row, 'Причина', safeText_(data.reason || data.reasonCode));
  set_(sheet, row, 'Оновлено', now);

  if (isFailed_(status)) {
    if (safeText_(get_(sheet, row, 'Purchase State')) !== 'sent') {
      set_(sheet, row, 'Purchase State', 'failed');
      set_(sheet, row, 'Purchase State Updated At', now);
      set_(sheet, row, 'Статус оплати', 'Оплата неуспішна');
      if (previousBusinessStatus !== 'Оплата неуспішна') sendPaymentTelegram_(sheet, row, false);
    }
    return { status: 'failed', confirmed: false, purchaseState: safeText_(get_(sheet, row, 'Purchase State')) };
  }

  if (!isPositive_(status)) {
    return { status: 'pending', confirmed: false, purchaseState: safeText_(get_(sheet, row, 'Purchase State')) };
  }

  var firstPositive = get_(sheet, row, 'First Positive At');
  if (!firstPositive) {
    firstPositive = now;
    set_(sheet, row, 'First Positive At', firstPositive);
  }

  var purchaseState = safeText_(get_(sheet, row, 'Purchase State'));
  var purchaseEventId = safeText_(get_(sheet, row, 'Purchase Event ID')) || ('purchase_' + orderReference);
  if (!get_(sheet, row, 'Purchase Event ID')) set_(sheet, row, 'Purchase Event ID', purchaseEventId);

  if (purchaseState === 'sent') {
    return buildOrderState_(sheet, row, { claimGranted: false, confirmed: true });
  }

  var elapsed = now.getTime() - new Date(firstPositive).getTime();
  if (elapsed < STABILIZATION_MS) {
    return buildOrderState_(sheet, row, {
      claimGranted: false,
      confirmed: false,
      retryAfterMs: Math.max(1000, STABILIZATION_MS - elapsed)
    });
  }

  var stateUpdatedAt = get_(sheet, row, 'Purchase State Updated At');
  var sendingIsFresh = purchaseState === 'sending' && stateUpdatedAt &&
    (now.getTime() - new Date(stateUpdatedAt).getTime() < SENDING_STALE_MS);

  if (sendingIsFresh) {
    return buildOrderState_(sheet, row, { claimGranted: false, confirmed: false, retryAfterMs: 2500 });
  }

  set_(sheet, row, 'Purchase State', 'sending');
  set_(sheet, row, 'Purchase State Updated At', now);

  return buildOrderState_(sheet, row, { claimGranted: true, confirmed: false });
}

function purchaseComplete_(data) {
  var sheet = getSheet_();
  var row = findOrderRow_(sheet, safeText_(data.orderReference));
  if (row === -1) return { status: 'order_not_found' };

  var previous = safeText_(get_(sheet, row, 'Статус оплати'));
  var now = new Date();

  if (safeText_(get_(sheet, row, 'Purchase State')) !== 'sent') {
    set_(sheet, row, 'Purchase State', 'sent');
    set_(sheet, row, 'Purchase State Updated At', now);
    set_(sheet, row, 'Purchase Confirmed At', now);
    set_(sheet, row, 'Purchase Event ID', safeText_(data.purchaseEventId) || ('purchase_' + safeText_(data.orderReference)));
    set_(sheet, row, 'Статус оплати', 'Оплата успішна');
    if (data.transactionStatus) set_(sheet, row, 'Статус WayForPay', safeText_(data.transactionStatus));
    if (data.amount !== undefined && data.amount !== null && data.amount !== '') set_(sheet, row, 'Сума', data.amount);
    if (data.currency) set_(sheet, row, 'Валюта', safeText_(data.currency));
    set_(sheet, row, 'Оновлено', now);
    if (previous !== 'Оплата успішна') sendPaymentTelegram_(sheet, row, true);
  }

  return buildOrderState_(sheet, row, { confirmed: true, claimGranted: false });
}

function purchaseRetry_(data) {
  var sheet = getSheet_();
  var row = findOrderRow_(sheet, safeText_(data.orderReference));
  if (row === -1) return { status: 'order_not_found' };
  if (safeText_(get_(sheet, row, 'Purchase State')) !== 'sent') {
    set_(sheet, row, 'Purchase State', 'retry');
    set_(sheet, row, 'Purchase State Updated At', new Date());
  }
  return buildOrderState_(sheet, row, { confirmed: false, claimGranted: false });
}

function buildOrderState_(sheet, row, extra) {
  var state = {
    status: 'ok',
    orderReference: safeText_(get_(sheet, row, 'Order ID')),
    transactionStatus: safeText_(get_(sheet, row, 'Статус WayForPay')),
    purchaseState: safeText_(get_(sheet, row, 'Purchase State')),
    purchaseEventId: safeText_(get_(sheet, row, 'Purchase Event ID')),
    confirmed: safeText_(get_(sheet, row, 'Purchase State')) === 'sent',
    amount: safeText_(get_(sheet, row, 'Сума')),
    currency: safeText_(get_(sheet, row, 'Валюта')),
    site: safeText_(get_(sheet, row, 'Сайт')),
    landingVariant: safeText_(get_(sheet, row, 'Landing Variant')),
    email: safeText_(get_(sheet, row, 'Email')),
    phone: safeText_(get_(sheet, row, 'Телефон / Telegram @')),
    fbp: safeText_(get_(sheet, row, '_fbp')),
    fbc: safeText_(get_(sheet, row, '_fbc')),
    clientIp: safeText_(get_(sheet, row, 'Client IP')),
    userAgent: safeText_(get_(sheet, row, 'User-Agent')),
    sourceUrl: safeText_(get_(sheet, row, 'Source URL'))
  };
  extra = extra || {};
  Object.keys(extra).forEach(function(key) { state[key] = extra[key]; });
  return state;
}

function orderState_(data) {
  var sheet = getSheet_();
  var row = findOrderRow_(sheet, safeText_(data.orderReference));
  if (row === -1) return { status: 'order_not_found' };
  return buildOrderState_(sheet, row, {});
}

// Legacy compatibility. New Vercel files use payment_observed instead.
function updatePayment_(data) {
  return paymentObserved_(data);
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);

    var expectedKey = getIntegrationKey_();
    var receivedKey = e && e.parameter ? safeText_(e.parameter.key) : '';
    if (!expectedKey || receivedKey !== expectedKey) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Unauthorized' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var raw = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
    var data = JSON.parse(raw);
    var result;

    if (data.event === 'order_created') result = createOrder_(data);
    else if (data.event === 'payment_observed') result = paymentObserved_(data);
    else if (data.event === 'purchase_complete') result = purchaseComplete_(data);
    else if (data.event === 'purchase_retry') result = purchaseRetry_(data);
    else if (data.event === 'order_state') result = orderState_(data);
    else if (data.event === 'payment_update') result = updatePayment_(data);
    else throw new Error('Unknown event: ' + safeText_(data.event));

    return ContentService.createTextOutput(JSON.stringify({ status: 'ok', result: result }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: String(error) }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

function doGet() {
  return ContentService.createTextOutput('Nastya Leads Integration: OK')
    .setMimeType(ContentService.MimeType.TEXT);
}
