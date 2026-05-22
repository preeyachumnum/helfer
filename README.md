# Helfer

LINE OA + LIFF finance helper for slip uploads, manual transaction entry, Google Sheets storage, and guarded Hermes financial analysis.

## Setup

1. Install Node dependencies:

```powershell
npm install
```

2. Optional slip worker dependencies:

```powershell
python -m venv .venv
.\.venv\Scripts\pip install -r requirements-slip-worker.txt
```

For `pytesseract`, install the Tesseract OCR binary and Thai language data on the server. The worker will try `pytesseract`, `easyocr`, `pyzbar`, and OpenCV QR decoding when available.

3. Copy `.env.example` to `.env` and fill LINE, LIFF, Google Sheets, and Hermes values.

4. Create a Google Sheet tab named `transactions` with the header in `docs/architecture.md`.

5. Start development:

```powershell
npm run dev
```

## Main URLs

- `http://localhost:3000/liff/upload`
- `http://localhost:3000/liff/manual`
- `http://localhost:3000/liff/health`
- `http://localhost:3000/api/line/webhook`

## Notes

- Uploaded slip images are not persisted. They are processed as a temporary file and deleted in `lib/slipProcessor.ts`.
- Hermes is only called through the server-side gateway in `lib/hermes.ts`.
- If `HERMES_ENDPOINT` is not configured, the app returns a local rule-based financial summary.
