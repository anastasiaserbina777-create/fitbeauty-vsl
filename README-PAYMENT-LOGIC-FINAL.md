# Final payment logic

- No payment attempt: keep `Без спроби оплати`; no Telegram message.
- After an actual WayForPay payment attempt, `Approved`, `Success`, `Pending`, `InProcessing`, or `Processing` starts/continues the 11-second server-side stabilization window.
- If during the window a negative status arrives (`Declined`, `Withheld`, `Expired`, `Refunded`, `Voided`, `Cancelled/Canceled`): mark `Оплата неуспішна`, send failure Telegram message, show `payment-error.html`, no Meta Purchase and no course access.
- If 11 seconds elapse and the latest status is still one of the accepted processing/success statuses above: mark `Оплата успішна`, send success Telegram message, send Meta Purchase once, show `thank-you.html`, and expose `COURSE_ACCESS_URL`.
- `Pending` does not need to become `Approved` before success under this business rule.
