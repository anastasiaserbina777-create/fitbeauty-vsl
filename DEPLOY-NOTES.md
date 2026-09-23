# Fit Beauty l1 — deployment notes

Domain: `https://www.nastyagym.com`
Landing variant: `l1`
Meta Pixel ID: `1632037078438891`

## Before deploy

1. Replace the current Google Apps Script with `setup/APPS-SCRIPT-FINAL.gs`.
2. Deploy a new version of the existing Apps Script Web App so the Web App URL stays unchanged.
3. Keep existing Script Properties `TELEGRAM_TOKEN` and `INTEGRATION_KEY` unchanged.
4. In Vercel Production keep all existing WayForPay and Leads variables.
5. Add:
   - `META_CAPI_ACCESS_TOKEN`
   - `META_GRAPH_API_VERSION=v23.0`
   - `COURSE_ACCESS_URL`
6. For testing only, add `META_TEST_EVENT_CODE`, deploy, verify Meta Test Events, then remove it and redeploy Production.

## Existing variables that stay unchanged

- `WFP_MERCHANT_ACCOUNT`
- `WFP_MERCHANT_SECRET_KEY`
- `WFP_MERCHANT_DOMAIN=www.nastyagym.com`
- `SITE_URL=https://www.nastyagym.com`
- `WFP_AMOUNT`
- `LEADS_INTEGRATION_URL`
- `LEADS_INTEGRATION_KEY`

## Important

The private course URL is no longer present in `thank-you.html`. It is returned only by `/api/order-access` after the server-side order state is confirmed.
