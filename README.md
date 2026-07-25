# HouseCart

Household groceries + receipt splitting. Mobile-first web app.

See **[SETUP.md](SETUP.md)** to turn on Google sign-in.

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
| Google sign-in | **Real** — Google Identity Services; the ID token is exchanged for a Firebase session |
| Shared households | **Firestore** — live sync across devices, offline cache, `firestore.rules` enforces access |
| Storage | **Firestore**, with localStorage as an optimistic cache. `?local=1` forces local-only (used by the tests) |

## Next steps for production
1. **Cloud Console** → OAuth 2.0 Web client, authorized origin = your domain → paste ID into `GOOGLE_CLIENT_ID`.
2. **Backend** — swap `DB`/`houses` for an API (houses, members, pantry, trips). Verify the Google ID token server-side.
3. **Better OCR** — Tesseract is fine for clean receipts; Google Cloud Vision or Veryfi handles crumpled thermal paper far better. The parser in `parseReceipt()` stays the same either way.

## Live
- https://gethousecart.vercel.app (production)
- https://housecart-kappa.vercel.app (Vercel-generated alias, same deployment)

`housecart.vercel.app` and `house-cart.vercel.app` are both already claimed by
other Vercel accounts, so the project is named `housecart` and serves from
`gethousecart.vercel.app` until a real custom domain is attached.
