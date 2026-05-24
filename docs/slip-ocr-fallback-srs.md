# SRS: Slip OCR with OCR.space + VPS Fallback

## Goal

Add payment-slip capture to Helfer while keeping Vercel/Next.js as the source of truth and using the VPS OCR service only as a fallback.

## Selected architecture: Option B

```text
Helfer Vercel
├─ LIFF /liff/upload            # user selects/takes slip photo
├─ API /api/slips/upload        # OCR preview + confirmed save
├─ LINE webhook /api/line/webhook
│  └─ native image → OCR → save/reply
├─ OCR.space                    # primary OCR provider
├─ VPS fallback OCR endpoint    # optional fallback if OCR.space fails
└─ Google Sheets                # transaction storage
```

The old VPS LINE OA service should not be the primary LINE webhook. If reused, expose it as a narrow OCR API and point `SLIP_OCR_FALLBACK_URL` to that endpoint.

## User flows

### 1. LIFF upload flow

1. User opens LINE rich menu item for `/liff/upload`.
2. LIFF authenticates with LINE ID token.
3. User chooses or takes a slip image.
4. Browser resizes/compresses the image before upload.
5. `POST /api/slips/upload` receives `multipart/form-data`:
   - `idToken`
   - `image`
6. Server verifies LIFF ID token.
7. Server calls OCR.space first.
8. If OCR.space fails and `SLIP_OCR_FALLBACK_URL` is configured, server calls the VPS fallback OCR endpoint.
9. Server parses OCR text into:
   - amount
   - transaction date/time
   - receiver/merchant
   - note
   - confidence
10. UI displays editable fields.
11. User confirms.
12. UI sends JSON to `POST /api/slips/upload`:
   - `idToken`
   - `extraction`
13. Server saves a `liff_slip` transaction to Google Sheets.

### 2. Native LINE image flow

1. User sends a slip image directly to the LINE OA chat.
2. LINE calls `POST /api/line/webhook`.
3. Server verifies LINE signature.
4. Server downloads the image from LINE content API.
5. Server runs OCR.space, then VPS fallback if needed.
6. Server parses fields.
7. If a slip and amount are found, server saves a `line_slip` transaction to Google Sheets.
8. Server replies with a short Thai summary:

```text
บันทึกจากสลิปแล้ว

จำนวนเงิน: <amount>
วันเวลา: <date-time>
ผู้รับ: <receiver>
โน้ต: <note>
```

If OCR confidence is low or data is incomplete, the record status becomes `needs_review`.

## Environment variables

Required for OCR.space primary path:

```env
OCRSPACE_API_KEY=
OCRSPACE_ENDPOINT=https://api.ocr.space/parse/image
OCRSPACE_LANGUAGE=tha
OCRSPACE_ENGINE=2
OCRSPACE_MAX_BYTES=950000
```

Optional fallback path:

```env
SLIP_OCR_FALLBACK_URL=disabled
SLIP_OCR_FALLBACK_TOKEN=
```

Fallback endpoint contract:

- Method: `POST`
- Content type: `multipart/form-data`
- File field: `image`
- Optional auth: `Authorization: Bearer <SLIP_OCR_FALLBACK_TOKEN>`
- Response may be either:

```json
{
  "rawText": "OCR text..."
}
```

or a full extraction object:

```json
{
  "isSlip": true,
  "type": "expense",
  "amount": 55,
  "currency": "THB",
  "transactionAt": "2026-05-22T10:10:37+07:00",
  "merchantOrCounterparty": "ร้านค้า",
  "note": "-",
  "rawText": "OCR text...",
  "confidence": 0.85,
  "reasons": ["อ่านข้อมูลหลักจากสลิปได้ครบ"]
}
```

## Files changed

- `.env.template`
  - Adds OCR.space and fallback env vars.
- `lib/env.ts`
  - Parses OCR and fallback config.
- `lib/types.ts`
  - Adds `provider` to `SlipExtraction`.
- `lib/slip/parser.ts`
  - Rule-based Thai slip parser.
- `lib/slip/ocr.ts`
  - OCR.space primary provider and VPS fallback provider.
- `lib/slip/transaction.ts`
  - Converts extraction to transaction records and formats LINE replies.
- `app/api/slips/upload/route.ts`
  - Enables LIFF upload OCR preview and confirmed save.
- `app/liff/upload/page.tsx`
  - Adds LIFF upload UI with browser-side image compression and editable preview.
- `app/liff/page.tsx`
  - Allows `/liff/upload` redirect state.
- `app/api/line/webhook/route.ts`
  - Enables native LINE image OCR and auto-save/reply.
- `app/globals.css`
  - Adds upload page styling.

## Deployment checklist

1. Set Vercel environment variables:

```env
OCRSPACE_API_KEY=<secret>
OCRSPACE_ENDPOINT=https://api.ocr.space/parse/image
OCRSPACE_LANGUAGE=tha
OCRSPACE_ENGINE=2
OCRSPACE_MAX_BYTES=950000
SLIP_OCR_FALLBACK_URL=disabled
SLIP_OCR_FALLBACK_TOKEN=
```

2. If VPS fallback is needed later, deploy an OCR-only endpoint and set:

```env
SLIP_OCR_FALLBACK_URL=https://srv1669992.hstgr.cloud/line-oa/ocr
SLIP_OCR_FALLBACK_TOKEN=<optional secret>
```

3. Update LINE rich menu / LIFF link to include `/liff/upload`.
4. Ensure LINE Messaging API webhook points to Vercel:

```text
https://<vercel-domain>/api/line/webhook
```

5. Verify:
   - Open LIFF upload page.
   - Upload a known slip.
   - Confirm save.
   - Check Google Sheets row with `source=liff_slip`.
   - Send an image directly to LINE OA.
   - Check LINE reply and Google Sheets row with `source=line_slip`.

## Safety and privacy notes

- OCR API keys are server-side only. Do not expose them in LIFF/browser code.
- Do not log LINE access tokens, channel secrets, Google private keys, or OCR API keys.
- Native LINE images are saved automatically only when amount is found. Low confidence rows are marked `needs_review`.
