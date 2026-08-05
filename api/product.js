/* ═══════════════════════════════════════════════════════════════════════════
   /api/product?code=<barcode>  —  one barcode in, one product out.

   WHY THIS EXISTS.  The app used to ask Open Food Facts directly from the
   phone.  That works for maybe half of a real American grocery run: OFF is a
   crowd-sourced FOOD database, thin on US private labels.  Measured against
   five real Kirkland Signature UPCs, the Open*Facts family knew ZERO of them;
   UPCitemdb knew all five.  So the honest fix is to ask several databases, not
   just one.

   Why it has to live on the server: UPCitemdb sends
   `Access-Control-Allow-Origin: https://www.upcitemdb.com`, so a browser fetch
   is refused before it starts.  A tiny serverless hop has no such problem, and
   it also lets Vercel's edge cache a hit so the same yoghurt is only ever
   looked up once for everybody.

   Order is cheapest-and-richest first, and every source is optional: if one is
   down, rate-limited or simply ignorant, we fall through to the next.
   ═══════════════════════════════════════════════════════════════════════════ */

const TIMEOUT = 4500;

/* ── barcode normalisation ────────────────────────────────────────────────
   The same physical product has several legal spellings.  A US UPC-A is 12
   digits; the international EAN-13 for the same item is that with a leading
   zero; databases disagree about which one they store.  UPC-E is an 8-digit
   COMPRESSED form that has to be expanded before anyone recognises it.  We try
   every plausible spelling rather than betting on one. */
function upcEtoA(e) {
  // e is 8 digits: number system (1) + 6 payload + check digit
  if (!/^[01]\d{7}$/.test(e)) return null;
  const s = e[0], d = e.slice(1, 7), chk = e[7];
  const last = d[5];
  let mid;
  if (last === "0" || last === "1" || last === "2") mid = d.slice(0, 2) + last + "0000" + d.slice(2, 5);
  else if (last === "3") mid = d.slice(0, 3) + "00000" + d.slice(3, 5);
  else if (last === "4") mid = d.slice(0, 4) + "00000" + d[4];
  else mid = d.slice(0, 5) + "0000" + last;
  return s + mid + chk;
}

function variants(raw) {
  const code = String(raw || "").replace(/\D/g, "");
  if (!code) return [];
  const out = new Set([code]);
  if (code.length === 8) { const a = upcEtoA(code); if (a) out.add(a); out.add("0".repeat(5) + code); }
  if (code.length === 12) out.add("0" + code);
  if (code.length === 13 && code[0] === "0") out.add(code.slice(1));
  if (code.length === 14 && code[0] === "0") { out.add(code.slice(1)); if (code[1] === "0") out.add(code.slice(2)); }
  if (code.length === 11) out.add("0" + code);
  return [...out];
}

async function grab(url, headers) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), TIMEOUT);
  try {
    const r = await fetch(url, { signal: ac.signal, headers: { "User-Agent": "HouseCart/1.0 (household grocery app)", ...(headers || {}) } });
    return { ok: r.ok, status: r.status, text: await r.text() };
  } catch (e) { return { ok: false, status: 0, text: "" }; } finally { clearTimeout(t); }
}

async function getJSON(url, headers) {
  const r = await grab(url, headers);
  if (!r.ok) return null;
  try { return JSON.parse(r.text); } catch (e) { return null; }
}

const wait = ms => new Promise(r => setTimeout(r, ms));

const tidy = s => String(s || "").replace(/\s+/g, " ").trim();

/* ── source 1: the Open*Facts family ─────────────────────────────────────
   Food, general products, beauty and pet food are four separate databases
   sharing one API shape.  Free, open, no key, good on brands sold in Europe
   and on anything a volunteer has ever photographed. */
const OFF_HOSTS = [
  "world.openfoodfacts.org",
  "world.openproductsfacts.org",
  "world.openbeautyfacts.org",
  "world.openpetfoodfacts.org",
];

async function fromOpenFacts(code) {
  const fields = "product_name,product_name_en,generic_name,brands,quantity,image_front_small_url,image_url,categories";
  const tries = [];
  for (const h of OFF_HOSTS) tries.push({ h, url: `https://${h}/api/v2/product/${code}.json?fields=${fields}` });
  const results = await Promise.all(tries.map(t => getJSON(t.url).then(j => ({ ...t, j }))));
  for (const { h, j } of results) {
    const p = j && j.status === 1 && j.product;
    if (!p) continue;
    const name = tidy(p.product_name || p.product_name_en || p.generic_name);
    const brand = tidy((p.brands || "").split(",")[0]);
    if (!name && !brand) continue;                    // a shell record with no words in it is not an answer
    if (/^test\b|^test product/i.test(name)) continue; // OFF carries scratch entries on round-number codes
    return {
      name: name || brand,
      brand, size: tidy(p.quantity),
      img: p.image_front_small_url || p.image_url || "",
      cathint: tidy(p.categories),
      source: h.replace("world.", "").replace(".org", ""),
      /* A record with a BRAND but no product name is a stub someone started and
         never finished — "Kirkland Signature", no idea of what.  It counts as a
         last resort, not as an answer, so the search carries on to a database
         that might know this is shampoo. */
      weak: !name,
    };
  }
  return null;
}

/* ── source 2: UPCitemdb ──────────────────────────────────────────────────
   ~hundreds of millions of retail barcodes, strong exactly where OFF is weak:
   US private label, household goods, anything from a warehouse club.  The free
   trial tier is rate-limited per IP, which is why responses are edge-cached. */
async function fromUpcItemDb(code) {
  /* The free tier is a BURST limit (a handful of calls per window), and Vercel's
     egress IPs are shared — so a "slow down" is routine, not fatal.  One patient
     retry turns most of them into an answer; the edge cache keeps us from
     asking twice for the same item.  A paid key, if one is ever set, skips the
     queue entirely. */
  const key = process.env.UPCITEMDB_KEY;
  const url = key
    ? `https://api.upcitemdb.com/prod/v1/lookup?upc=${encodeURIComponent(code)}`
    : `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(code)}`;
  const headers = key ? { user_key: key, key_type: "3scale" } : undefined;
  let j = await getJSON(url, headers);
  if (j && j.code === "TOO_FAST") { await wait(1200); j = await getJSON(url, headers); }
  const it = j && j.code === "OK" && Array.isArray(j.items) && j.items[0];
  if (!it) return null;
  const title = tidy(it.title).split(" | ")[0];       // "…(Pack of 2) | total 12 count"
  if (!title) return null;
  const brand = tidy(it.brand);
  /* Titles arrive as "Kirkland Signature Purified Drinking Water, 16.9 Ounce,
     40 Count" — the size is usually welded onto the end.  Split it off so the
     pantry row reads like a product and not like a listing. */
  let name = title, size = tidy(it.size);
  const m = title.match(/^(.*?),\s*([^,]*\d[^,]*(?:,\s*[^,]*(?:count|ct|pack|pk)[^,]*)?)$/i);
  if (m && m[1].length > 8) { name = tidy(m[1]); size = size || tidy(m[2]); }
  const sz = name.match(/\s+[-–]\s+([\d.]+\s*(?:oz|lb|lbs|ml|l|g|kg|ct|count|pk|pack)\b.*)$/i);
  if (sz) { name = tidy(name.slice(0, sz.index)); size = size || tidy(sz[1]); }
  /* Strip the brand off the front so the row doesn't read "Kirkland Signature —
     Kirkland Signature Diapers".  Brands are recorded inconsistently ("KIRKLAND"
     for a product titled "Kirkland Signature …"), so this walks off leading
     words that belong to the brand rather than matching the string whole — plus
     the house-label words that always trail a brand. */
  if (brand) {
    const bt = new Set(brand.toLowerCase().split(/[^a-z0-9]+/i).filter(Boolean));
    const LINE = new Set(["signature", "select", "brand", "brands"]);
    let w = name.split(" "), n = 0;
    while (w.length > 2 && (bt.has(w[0].toLowerCase().replace(/[^a-z0-9]/g, "")) ||
           (n > 0 && LINE.has(w[0].toLowerCase())))) { w.shift(); n++; }
    if (n) name = tidy(w.join(" "));
  }
  return {
    name, brand, size,
    img: (Array.isArray(it.images) && it.images.find(u => /^https:/.test(u))) || "",
    cathint: tidy(it.category),
    source: "upcitemdb",
  };
}

/* ── source 3: Go-UPC ─────────────────────────────────────────────────────
   A billion-item catalogue whose public search page is plain server-rendered
   HTML, so a keyless read is possible.  Deliberately last-but-one and narrowly
   parsed: if their markup changes, the selectors miss, this returns null, and
   the other sources carry the app as before. */
const un = s => tidy(String(s || "")
  .replace(/&amp;/g, "&").replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"')
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " "));

async function fromGoUpc(code) {
  const r = await grab(`https://go-upc.com/search?q=${encodeURIComponent(code)}`, {
    "User-Agent": "Mozilla/5.0 (compatible; HouseCart/1.0)", "Accept": "text/html",
  });
  if (!r.ok || /Product Not Found/i.test(r.text)) return null;
  const h1 = r.text.match(/<h1[^>]*class="[^"]*product-name[^"]*"[^>]*>([^<]+)</i);
  let name = un(h1 && h1[1]);
  if (!name) return null;
  const cell = label => {
    const m = r.text.match(new RegExp(`<td[^>]*class="metadata-label"[^>]*>\\s*${label}\\s*</td>\\s*<td[^>]*>([^<]*)</td>`, "i"));
    return un(m && m[1]);
  };
  const brand = cell("Brand");
  const img = (r.text.match(/<img[^>]+src="(https:\/\/go-upc\.s3\.amazonaws\.com\/images\/[^"]+)"/i) || [])[1] || "";
  let size = "";
  const m = name.match(/^(.*?),\s*([^,]*\d[^,]*)$/);
  if (m && m[1].length > 8) { name = tidy(m[1]); size = tidy(m[2]); }
  if (brand && name.toLowerCase().startsWith(brand.toLowerCase() + " ") && name.length > brand.length + 3)
    name = tidy(name.slice(brand.length));
  return { name, brand, size, img, cathint: cell("Category"), source: "go-upc" };
}

/* ── source 4: USDA FoodData Central ──────────────────────────────────────
   The US government's branded-food database — ~2M items, every one with a real
   UPC. Works with DEMO_KEY at a low rate limit; set FDC_API_KEY for headroom. */
async function fromUSDA(code) {
  const key = process.env.FDC_API_KEY || "DEMO_KEY";
  const j = await getJSON(`https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(code)}&dataType=Branded&pageSize=5&api_key=${key}`);
  const foods = (j && j.foods) || [];
  const hit = foods.find(f => String(f.gtinUpc || "").replace(/^0+/, "") === String(code).replace(/^0+/, "")) || null;
  if (!hit) return null;
  const name = tidy(hit.description);
  if (!name) return null;
  return {
    name: name.replace(/\s*\b[A-Z]{4,}\b\s*$/, "").trim() || name,
    brand: tidy(hit.brandName || hit.brandOwner),
    size: tidy(hit.packageWeight),
    img: "",
    cathint: tidy(hit.foodCategory || hit.brandedFoodCategory),
    source: "usda",
  };
}

module.exports = async (req, res) => {
  const raw = (req.query && req.query.code) || "";
  const codes = variants(raw);
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (!codes.length) { res.status(400).json({ ok: false, error: "no code" }); return; }

  /* Every spelling of the barcode against every database, in source order.
     OFF first (open data, images), then UPCitemdb (the US gap-filler), then
     USDA.  First real answer wins. */
  let fallback = null;                     // best brand-only stub seen so far
  for (const fn of [fromOpenFacts, fromUpcItemDb, fromGoUpc, fromUSDA]) {
    for (const code of codes) {
      let hit = null;
      try { hit = await fn(code); } catch (e) { hit = null; }
      if (!hit) continue;
      if (hit.weak) { fallback = fallback || { ...hit, matched: code }; continue; }
      // a week at the edge: barcodes don't change what they point at
      res.setHeader("Cache-Control", "public, s-maxage=604800, stale-while-revalidate=86400");
      res.status(200).json({ ok: true, code: raw, matched: code, ...hit });
      return;
    }
  }
  if (fallback) {
    res.setHeader("Cache-Control", "public, s-maxage=86400");
    res.status(200).json({ ok: true, code: raw, ...fallback });
    return;
  }
  // Cache misses briefly too — a product that isn't in any database now is
  // unlikely to appear in the next hour, and this protects the rate limits.
  res.setHeader("Cache-Control", "public, s-maxage=3600");
  res.status(200).json({ ok: false, code: raw, tried: codes, sources: ["openfacts", "upcitemdb", "go-upc", "usda"] });
};

module.exports.variants = variants;
