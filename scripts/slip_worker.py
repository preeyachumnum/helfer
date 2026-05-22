import json
import re
import sys
from datetime import datetime


THAI_BANKS = {
    "กสิกร": "KBank",
    "kasikorn": "KBank",
    "kbank": "KBank",
    "ไทยพาณิชย์": "SCB",
    "scb": "SCB",
    "กรุงเทพ": "BBL",
    "bangkok bank": "BBL",
    "กรุงไทย": "KTB",
    "krungthai": "KTB",
    "กรุงศรี": "BAY",
    "krungsri": "BAY",
    "ทหารไทย": "TTB",
    "ttb": "TTB",
    "ออมสิน": "GSB",
    "gsb": "GSB",
}

SLIP_KEYWORDS = [
    "โอนเงิน",
    "สำเร็จ",
    "จำนวนเงิน",
    "เลขที่รายการ",
    "transaction",
    "transfer",
    "successful",
    "amount",
]


def main():
    image_path = sys.argv[1]
    raw_text = read_text(image_path)
    qr_text = read_qr(image_path)
    combined = "\n".join(part for part in [raw_text, qr_text] if part).strip()
    result = extract_slip(combined)
    print(json.dumps(result, ensure_ascii=False))


def read_text(image_path):
    for reader in (read_with_pytesseract, read_with_easyocr):
        try:
            text = reader(image_path)
            if text.strip():
                return text
        except Exception:
            continue
    return ""


def read_with_pytesseract(image_path):
    from PIL import Image
    import pytesseract

    return pytesseract.image_to_string(Image.open(image_path), lang="tha+eng")


def read_with_easyocr(image_path):
    import easyocr

    reader = easyocr.Reader(["th", "en"], gpu=False)
    rows = reader.readtext(image_path, detail=0, paragraph=True)
    return "\n".join(rows)


def read_qr(image_path):
    for reader in (read_qr_with_pyzbar, read_qr_with_opencv):
        try:
            text = reader(image_path)
            if text:
                return text
        except Exception:
            continue
    return ""


def read_qr_with_pyzbar(image_path):
    from PIL import Image
    from pyzbar.pyzbar import decode

    codes = decode(Image.open(image_path))
    return "\n".join(code.data.decode("utf-8", errors="ignore") for code in codes)


def read_qr_with_opencv(image_path):
    import cv2

    image = cv2.imread(image_path)
    detector = cv2.QRCodeDetector()
    data, _, _ = detector.detectAndDecode(image)
    return data or ""


def extract_slip(text):
    normalized = normalize(text)
    amount = extract_amount(normalized)
    bank = extract_bank(normalized)
    tx_at = extract_datetime(normalized)
    is_slip, reasons = validate_slip(normalized, amount)
    confidence = score_confidence(normalized, amount, bank, tx_at)

    return {
        "isSlip": bool(is_slip),
        "type": infer_type(normalized),
        "amount": amount,
        "currency": "THB",
        "bank": bank,
        "transactionAt": tx_at,
        "merchantOrCounterparty": extract_counterparty(text),
        "note": "",
        "rawText": text,
        "confidence": confidence,
        "reasons": reasons,
    }


def normalize(text):
    return re.sub(r"\s+", " ", text or "").lower()


def extract_amount(text):
    candidates = []
    for match in re.finditer(r"(?<!\d)(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{2}))?(?!\d)", text):
        value = match.group(0).replace(",", "")
        try:
            number = float(value)
        except ValueError:
            continue
        if 1 <= number <= 10_000_000:
            candidates.append(number)

    if not candidates:
        return None

    # Thai bank slips often contain account suffixes and refs; the largest money-like
    # value is a practical no-AI fallback for MVP parsing.
    return max(candidates)


def extract_bank(text):
    for keyword, bank in THAI_BANKS.items():
        if keyword in text:
            return bank
    return None


def extract_datetime(text):
    patterns = [
        r"(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\s+(\d{1,2})[:.](\d{2})",
        r"(\d{4})[/-](\d{1,2})[/-](\d{1,2})\s+(\d{1,2})[:.](\d{2})",
    ]

    for pattern in patterns:
        match = re.search(pattern, text)
        if not match:
            continue

        parts = [int(part) for part in match.groups()]
        try:
            if len(str(parts[0])) == 4:
                year, month, day, hour, minute = parts
            else:
                day, month, year, hour, minute = parts
                if year < 100:
                    year += 2000
                if year > 2400:
                    year -= 543

            return datetime(year, month, day, hour, minute).isoformat()
        except ValueError:
            continue

    return None


def extract_counterparty(text):
    lines = [line.strip() for line in (text or "").splitlines() if line.strip()]
    for line in lines:
        lower = line.lower()
        if any(word in lower for word in ["นาย", "นาง", "บริษัท", "mr", "mrs", "ms"]):
            return line[:120]
    return None


def infer_type(text):
    income_words = ["รับเงิน", "เงินเข้า", "received", "deposit"]
    expense_words = ["โอนเงิน", "จ่าย", "ชำระ", "transfer", "payment"]

    if any(word in text for word in income_words):
        return "income"
    if any(word in text for word in expense_words):
        return "expense"
    return "unknown"


def validate_slip(text, amount):
    reasons = []
    keyword_hits = [word for word in SLIP_KEYWORDS if word in text]
    if keyword_hits:
        reasons.append("matched slip keywords")
    if amount:
        reasons.append("matched amount")
    if extract_bank(text):
        reasons.append("matched bank")

    return len(reasons) >= 2, reasons


def score_confidence(text, amount, bank, tx_at):
    score = 0.0
    if amount:
        score += 0.35
    if bank:
        score += 0.2
    if tx_at:
        score += 0.15
    if any(word in text for word in SLIP_KEYWORDS):
        score += 0.3
    return round(min(score, 1.0), 2)


if __name__ == "__main__":
    main()
