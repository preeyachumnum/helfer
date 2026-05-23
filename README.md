# Helfer

LINE OA + LIFF finance helper for manual transaction entry, Google Sheets storage, and guarded Hermes financial analysis.

## Setup

1. Install Node dependencies:

```powershell
npm install
```

2. Copy `.env.template` to `.env` and fill LINE, LIFF, Google Sheets, and Hermes values.

The app creates the `transactions` sheet tab and header automatically on first write.

3. Start development:

```powershell
npm run dev
```

## Main URLs

- `http://localhost:3000/liff/manual`
- `http://localhost:3000/liff/health`
- `http://localhost:3000/api/line/webhook`

## Notes

- Hermes is only called through the server-side gateway in `lib/hermes.ts`.
- If `HERMES_ENDPOINT` is not configured, the app returns a local rule-based financial summary.
