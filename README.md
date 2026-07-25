# HouseCart

Household groceries + receipt splitting. Mobile-first web app.

**Flow:** Google sign-in → join a house by code → scan groceries into a shared
pantry → photograph a receipt → OCR pulls the line items → **you pick which
ones the house splits** → tax allocated proportionally → one-tap Venmo requests
→ per-household spending tracking.

## Run it
```
python3 -m http.server 8123 --directory prototype
# open http://localhost:8123
```

## Verify it (headless Chromium, real OCR + real API call)
```
node verify.mjs http://localhost:8123
```

## What's real vs. stubbed
| | |
|---|---|
| Barcode scan | **Real** — `BarcodeDetector` API, ZXing fallback |
| Product name / size / **photo** | **Real** — Open Food Facts API, no key needed |
| Receipt OCR | **Real** — Tesseract.js, runs client-side, no upload |
| Line-item parsing, split math, tax allocation | **Real** |
| Venmo charge links | **Real** — `venmo.com/<handle>?txn=charge&amount=&note=` |
| Google sign-in | **Stubbed** — drop your Cloud Console web client ID into `GOOGLE_CLIENT_ID` at the top of the script and the real GIS button takes over |
| Storage | **localStorage** — needs a server + DB before housemates on different phones share a house for real |

## Next steps for production
1. **Cloud Console** → OAuth 2.0 Web client, authorized origin = your domain → paste ID into `GOOGLE_CLIENT_ID`.
2. **Backend** — swap `DB`/`houses` for an API (houses, members, pantry, trips). Verify the Google ID token server-side.
3. **Better OCR** — Tesseract is fine for clean receipts; Google Cloud Vision or Veryfi handles crumpled thermal paper far better. The parser in `parseReceipt()` stays the same either way.
