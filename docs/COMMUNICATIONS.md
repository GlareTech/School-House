# Mailing and SMS service

The Communications page sends email and SMS to one or more students, their guardians, a class, or all active students. Whole-school campaigns are administrator-only. Staff need `COMMUNICATIONS_MANAGE` and can message only students in classes they are assigned to manage or lead as class teacher.

## Enable the module

Edit `config/features.json` and set `communications`, plus `email` and/or `sms`, to `true`. Environment values such as `FEATURE_COMMUNICATIONS=false` override the file. Restart both API and worker after any feature or provider change.

Provider credentials belong only in `.env`; never place them in `config/features.json` or commit them to source control. Providers default to `disabled`.

## Email over SMTP

Set:

```dotenv
MAIL_TRANSPORT=smtp
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=service-account@example.com
SMTP_PASS=replace-with-provider-secret
SMTP_FROM=Schoolhouse <service-account@example.com>
```

Use port 465 with `SMTP_SECURE=true` when the provider requires implicit TLS. The worker has connection and socket timeouts and does not load message content from files or URLs.

## SMS through a generic provider

Set an HTTPS endpoint and bearer token:

```dotenv
SMS_TRANSPORT=generic
SMS_API_URL=https://sms-provider.example/v1/messages
SMS_API_TOKEN=replace-with-provider-secret
SMS_SENDER_ID=Schoolhouse
```

Each request is JSON:

```json
{
  "to": "+2348012345678",
  "message": "School closes at 2 p.m. today.",
  "sender": "Schoolhouse",
  "reference": "unique-recipient-id"
}
```

The request includes `Authorization: Bearer ...` and `Idempotency-Key`. A successful JSON response may return `id` or `sid`. Adapt the provider-facing function in `backend/src/communication-service.js` if a vendor uses a different contract.

## SMS through Twilio

Set:

```dotenv
SMS_TRANSPORT=twilio
TWILIO_ACCOUNT_SID=replace-with-account-sid
TWILIO_AUTH_TOKEN=replace-with-auth-token
TWILIO_FROM=+15005550006
```

## Development preview

`MAIL_TRANSPORT=console` and `SMS_TRANSPORT=console` record delivery in server logs without contacting a provider. Console transports are rejected when `NODE_ENV=production`.

## Delivery and privacy behavior

The API stores one campaign and one outbox record per unique channel and destination. The worker claims small batches with leases, retries temporary failures with exponential delays, and marks terminal failures after `COMMUNICATION_MAX_ATTEMPTS`. Restarting the worker does not lose queued messages. Provider message identifiers and sanitized errors appear in delivery history; destinations are masked.

Student and guardian email/SMS preferences are stored on each student profile and can also be supplied in the student CSV import. A disabled preference or invalid destination is omitted before the campaign is created. The individual-recipient picker reports only whether a destination is available; it does not expose contact values.

Use `COMMUNICATION_BATCH_SIZE` to limit each worker pass. A campaign is limited to 2,000 students, individual selection to 500 students, and each sender to 10 campaigns per 15 minutes. SMS bodies are limited to 1,000 characters.
