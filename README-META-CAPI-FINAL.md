# Fit Beauty l1 — фінальна логіка оплати + Meta Pixel/CAPI

## Ключова зміна
Після відкриття WayForPay сайт НЕ перевіряє статус у фоні, поки користувач ще взаємодіє з Apple Pay / Google Pay / картковою формою.

Після того як WayForPay повернув користувача або віджет повідомив `Approved` / `Pending`, користувач переходить на `payment-pending.html`.

На pending-сторінці сервер робить `CHECK_STATUS` WayForPay:
- перший `Approved`, `Pending` або `InProcessing` запускає серверне 11-секундне вікно;
- якщо протягом вікна статус стає `Declined`, `Expired`, `Refunded` або `Voided` — `payment-error.html`, без Purchase і без доступу;
- після 11 секунд покупка підтверджується тільки якщо актуальний статус WayForPay = `Approved`; `Pending` або `InProcessing` залишають користувача на сторінці очікування до фінального статусу;
- після підтвердження сервер відправляє Meta CAPI Purchase;
- потім `thank-you.html` повторно перевіряє замовлення, відправляє браузерний Purchase з тим самим eventID і тільки після цього показує `COURSE_ACCESS_URL`.

Стан 11-секундної перевірки зберігається у Google Sheet через Apps Script, а не в браузерному `setTimeout`.

## Apps Script
Використовуй файл `FIT-BEAUTY-APPS-SCRIPT-FINAL.gs`.
Після вставки коду вручну запусти функцію `setupSheet`, потім створи/онови Web App deployment і встав новий URL у `LEADS_INTEGRATION_URL` у Vercel.

## Vercel variables
Старі змінні WayForPay не змінювати. Потрібні:
- WFP_MERCHANT_ACCOUNT
- WFP_MERCHANT_SECRET_KEY
- WFP_MERCHANT_DOMAIN=www.nastyagym.com
- SITE_URL=https://www.nastyagym.com
- WFP_AMOUNT
- LEADS_INTEGRATION_URL
- LEADS_INTEGRATION_KEY
- META_CAPI_ACCESS_TOKEN
- META_GRAPH_API_VERSION=v23.0
- COURSE_ACCESS_URL
- META_TEST_EVENT_CODE — лише тимчасово для Meta Test Events
