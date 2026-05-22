# Helfer Architecture

## Runtime

- Next.js/TypeScript is the main app, LIFF frontend, LINE webhook, Google Sheets writer, and Hermes gateway.
- Python is the slip worker for QR/OCR parsing without AI image reading.
- Images are read into memory or a temporary OS file only. The temp folder is removed after parsing.

## Routes

- `/liff/upload` opens a LIFF upload screen.
- `/liff/manual` opens the manual transaction form.
- `/liff/health` opens the financial health dashboard.
- `/api/line/webhook` receives LINE webhook events and image messages.
- `/api/slips/upload` receives LIFF image uploads.
- `/api/transactions/manual` saves manual records.
- `/api/health/analyze` reads user transactions and calls Hermes only after validation.

## Google Sheet

Create a sheet named `transactions` with this header row:

```text
id,lineUserId,source,type,amount,currency,category,note,merchantOrCounterparty,bank,transactionAt,recordedAt,lineMessageId,rawText,confidence,status
```

Share the spreadsheet with the service account email in `GOOGLE_SERVICE_ACCOUNT_EMAIL`.

## LINE Rich Menu

Recommended actions:

- Slip upload: URI action to `https://liff.line.me/{NEXT_PUBLIC_LIFF_ID}/upload`
- Manual entry: URI action to `https://liff.line.me/{NEXT_PUBLIC_LIFF_ID}/manual`
- Financial health: URI action to `https://liff.line.me/{NEXT_PUBLIC_LIFF_ID}/health`

Create only one LIFF app in LINE Developers. Point its endpoint URL to your deployed LIFF base, for example:

```text
https://helfer-brown.vercel.app/liff
```

LINE native image upload is also supported: users can send an image directly in chat and `/api/line/webhook` will process it.

## Hermes Gateway

Hermes is called only from `/api/health/analyze` through `lib/hermes.ts`.

The frontend never sees `HERMES_ENDPOINT` or `HERMES_API_KEY`. The gateway checks that the request has a valid LIFF ID token, loads server-side transactions, summarizes them, applies the minimum transaction threshold, and caches the result.
