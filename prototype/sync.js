/* ══════════════════════════════════════════════════════════════════════════
   sync.js — Firestore persistence for HouseCart.

   The app keeps rendering from a plain `houses` object exactly as before; this
   module's job is to keep that object true to the server and to turn local
   mutations into writes. Everything is live: a housemate approving you, adding
   a receipt or marking the oat milk empty lands on your screen without a
   refresh.

   Offline is handled by Firestore's own persistent cache, so the app keeps
   working in a shop with no signal and reconciles when you come back out.
   ══════════════════════════════════════════════════════════════════════════ */

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithCredential, signInWithPopup,
  signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut,
  browserLocalPersistence, setPersistence
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, collection, onSnapshot, setDoc, updateDoc, deleteDoc, getDoc, getDocs,
  query, where
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

const CFG = window.HOUSECART_CONFIG || {};
const app  = initializeApp(CFG.FIREBASE);
const auth = getAuth(app);
const db   = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

const listeners = [];                       // live subscriptions for the current user
const stop = () => { while(listeners.length) { try{ listeners.pop()(); }catch(e){} } };
const clean = o => JSON.parse(JSON.stringify(o));   // drop undefined before writing

/* ── auth ───────────────────────────────────────────────────────────────── */

const shape = u => ({ id:u.uid, name:u.displayName || u.email, email:u.email,
                      pic:u.photoURL || "", venmo:"" });

/* Keep the session on the device so a returning user is signed in silently. */
setPersistence(auth, browserLocalPersistence).catch(()=>{});

/* Firebase drives the whole handshake, the way Supabase does for Wanderlines:
   one button, Google's own page, back to the app signed in.

   Popup first — per Firebase's own guidance it is the option that works across
   every modern browser without extra setup, because it doesn't depend on
   cross-origin storage the way the redirect flow does. If the popup is blocked
   (common on mobile), fall back to a full-page redirect. */
async function signInWithGoogle(){
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    const { user } = await signInWithPopup(auth, provider);
    return shape(user);
  } catch(e){
    const c = e && e.code || "";
    if(/popup-blocked|popup-closed-by-user|cancelled-popup-request|operation-not-supported/.test(c)){
      if(/popup-closed-by-user|cancelled-popup-request/.test(c)) throw e;   // they backed out
      // Leave a note to ourselves that we're mid-handshake. On the way back the
      // app must WAIT for Google's answer rather than concluding "signed out"
      // and showing the sign-in screen again — that's how you end up signing
      // in twice.
      markRedirecting();
      await signInWithRedirect(auth, provider);        // navigates away; resumes below
      return null;
    }
    throw e;
  }
}

/* ── the "am I mid-redirect?" marker ──────────────────────────────────────
   Written just before we hand the browser to Google, read on the way back,
   cleared once Google's answer (either way) has landed. Stored in BOTH
   session and local storage: iOS occasionally hands a PWA a fresh session
   storage after a full-page navigation, and localStorage survives that.
   Stamped with a time so a marker left behind by an abandoned sign-in three
   days ago can't wedge the app on a spinner. */
const REDIR_KEY = "hc.redirecting", REDIR_TTL = 5 * 60 * 1000;
function markRedirecting(){
  const t = String(nowStamp());
  try { sessionStorage.setItem(REDIR_KEY, t); } catch(e){}
  try { localStorage.setItem(REDIR_KEY, t); } catch(e){}
}
function clearRedirecting(){
  try { sessionStorage.removeItem(REDIR_KEY); } catch(e){}
  try { localStorage.removeItem(REDIR_KEY); } catch(e){}
}
function nowStamp(){ return new Date().getTime(); }
function redirectPending(){
  let t = 0;
  try { t = +(sessionStorage.getItem(REDIR_KEY) || 0); } catch(e){}
  if(!t){ try { t = +(localStorage.getItem(REDIR_KEY) || 0); } catch(e){} }
  if(!t) return false;
  if(nowStamp() - t > REDIR_TTL){ clearRedirecting(); return false; }
  return true;
}

/* Called on every load: if we just came back from the redirect flow, this
   resolves with the user. */
async function completeRedirect(){
  try { const r = await getRedirectResult(auth); return r && r.user ? shape(r.user) : null; }
  catch(e){ console.warn("redirect result", e.code); return null; }
  finally { clearRedirecting(); }
}

/* Still used if a Google ID token arrives from somewhere else. */
async function signInWithGoogleIdToken(idToken){
  const cred = GoogleAuthProvider.credential(idToken);
  const { user } = await signInWithCredential(auth, cred);
  return shape(user);
}

function onUser(cb){
  return onAuthStateChanged(auth, u => cb(u && {
    id:u.uid, name:u.displayName || u.email, email:u.email, pic:u.photoURL || "", venmo:""
  }));
}

/* ── live reads ─────────────────────────────────────────────────────────── */

/* Every house this user belongs to, plus each one's pantry, trips and payments,
   streamed into `houses[code]` and re-rendered on every change. */
function watchHouses(uid, houses, onChange){
  stop();
  const seen = new Map();                       // code -> unsubscribe fns for subcollections

  const q = query(collection(db, "houses"), where("memberIds", "array-contains", uid));
  listeners.push(onSnapshot(q, snap => {
    const live = new Set();
    snap.forEach(d => {
      const h = d.data(); live.add(d.id);
      const prev = houses[d.id] || {};
      houses[d.id] = { ...prev, ...h, code:d.id,
        pantry: prev.pantry || [], trips: prev.trips || [], payments: prev.payments || [],
        barcodes: prev.barcodes || [], pending: prev.pending || [] };

      if(!seen.has(d.id)){
        const subs = [];
        const bind = (name, sort) => subs.push(onSnapshot(collection(db,"houses",d.id,name), s => {
          const rows = []; s.forEach(x => rows.push({ ...x.data(), id:x.id }));
          if(sort) rows.sort(sort);
          houses[d.id][name] = rows; onChange();
        }, err => console.warn(name, err.code)));
        bind("pantry",   (a,b) => (b.at||0) - (a.at||0));
        bind("trips",    (a,b) => (b.at||0) - (a.at||0));
        bind("payments", (a,b) => (b.at||0) - (a.at||0));
        bind("barcodes", (a,b) => (b.at||0) - (a.at||0));
        // join requests are admin-visible only; a permission error here is expected for non-admins
        subs.push(onSnapshot(collection(db,"houses",d.id,"joinRequests"), s => {
          const rows = []; s.forEach(x => rows.push({ ...x.data(), id:x.id }));
          houses[d.id].pending = rows; onChange();
        }, () => { houses[d.id].pending = []; }));
        seen.set(d.id, subs);
      }
    });
    // left a house? drop its listeners and its copy
    [...seen.keys()].forEach(code => {
      if(!live.has(code)){ seen.get(code).forEach(f=>{try{f()}catch(e){}}); seen.delete(code); delete houses[code]; }
    });
    onChange();
  }, err => {
    console.warn("houses query", err.code);
    /* A refused or failed QUERY shouldn't cost you your houses. Fall back to
       reading the ones we already know the codes of, one by one — a direct get
       takes a different rules path than a collection query. */
    const known = Object.keys(houses);
    if(!known.length) return onChange(err);
    Promise.all(known.map(async code => {
      try {
        const d = await getDoc(doc(db,"houses",code));
        if(d.exists() && (d.data().memberIds||[]).includes(uid)) houses[code] = { ...houses[code], ...d.data(), code };
        else delete houses[code];
      } catch(e){ /* leave the cached copy */ }
    })).then(() => onChange(Object.keys(houses).length ? null : err));
  }));

  listeners.push(() => seen.forEach(subs => subs.forEach(f=>{try{f()}catch(e){}})));
}

/* Watch my own pending request, so the waiting screen updates the moment the
   admin approves — no polling, no "check again". */
function watchMyRequest(uid, code, cb){
  return onSnapshot(doc(db,"houses",code,"joinRequests",uid),
    d => cb(d.exists() ? d.data() : null, null),
    err => cb(null, err));           // errors are NOT a decision — see caller
}

const peekHouse = code => getDoc(doc(db,"houseCodes",code)).then(d => d.exists() ? d.data() : null);

/* ── writes ─────────────────────────────────────────────────────────────── */

async function createHouse(code, name, member){
  await setDoc(doc(db,"houses",code), clean({
    code, name, adminId: member.id, memberIds: [member.id], members: [member], createdAt: Date.now()
  }));
  await setDoc(doc(db,"houseCodes",code), clean({
    name, nameLower: name.trim().toLowerCase(),
    adminId: member.id, adminName: member.name, createdAt: Date.now()
  }));
}

/* House names are global: two houses called "Maple St" would make a shared code
   ambiguous to talk about. houseCodes is readable by any signed-in user, so the
   check needs no extra collection or rule. */
async function nameTaken(name){
  const key = String(name||"").trim().toLowerCase();
  if(!key) return false;
  const snap = await getDocs(query(collection(db,"houseCodes"), where("nameLower","==",key)));
  if(snap.empty) return false;
  // A name is only really taken if the household behind it still exists. Entries
  // left over from a deletion are cleared here, so a name can never be
  // permanently lost to a bookkeeping mistake.
  let taken = false;
  for(const d of snap.docs){
    const h = await getDoc(doc(db,"houses",d.id));
    if(h.exists()){ taken = true; continue; }
    try { await deleteDoc(d.ref); console.info("cleared stale name entry", d.id); }
    catch(e){ console.warn("stale name entry needs a rules update to clear:", d.id, e.code); taken = true; }
  }
  return taken;
}

const releaseCode = code => deleteDoc(doc(db,"houseCodes",code));

/* Renaming touches two places: the house itself and its name entry. The entry
   is what enforces global uniqueness, so it has to move too. */
async function renameHouse(code, name){
  await updateDoc(doc(db,"houses",code), { name });
  await updateDoc(doc(db,"houseCodes",code), { name, nameLower: name.trim().toLowerCase() });
}

/* Every household this account belongs to OR admins, including ones whose house
   document is missing — used by Account so nothing can hide from you. */
async function myHouseCodes(uid){
  const out = [];
  const snap = await getDocs(query(collection(db,"houseCodes"), where("adminId","==",uid)));
  for(const d of snap.docs){
    const h = await getDoc(doc(db,"houses",d.id));
    out.push({ code:d.id, name:d.data().name, adminName:d.data().adminName, exists:h.exists() });
  }
  return out;
}

/* Houses created before nameLower existed wouldn't be found by that query, so
   the admin's own house backfills itself quietly on sign-in. */
async function ensureNameIndex(code, name, adminId){
  try{
    const ref = doc(db,"houseCodes",code);
    const d = await getDoc(ref);
    if(d.exists() && !d.data().nameLower)
      await updateDoc(ref, { nameLower: String(name||"").trim().toLowerCase() });
  }catch(e){ /* not admin, or offline — harmless */ }
}

const requestJoin = (code, who) =>
  setDoc(doc(db,"houses",code,"joinRequests",who.id), clean({ ...who, at: Date.now() }));

const cancelJoin = (code, uid) => deleteDoc(doc(db,"houses",code,"joinRequests",uid));

async function approveJoin(code, req){
  const ref = doc(db,"houses",code);
  const snap = await getDoc(ref);
  if(!snap.exists()) throw new Error("house is gone");
  const h = snap.data();
  if(h.memberIds.includes(req.id)) { await deleteDoc(doc(db,"houses",code,"joinRequests",req.id)); return; }
  await updateDoc(ref, {
    memberIds: [...h.memberIds, req.id],
    members:   [...h.members, clean({ id:req.id, name:req.name, email:req.email||"", pic:req.pic||"", venmo:"" })]
  });
  await deleteDoc(doc(db,"houses",code,"joinRequests",req.id));
}

const denyJoin = (code, uid) => deleteDoc(doc(db,"houses",code,"joinRequests",uid));

const setMembers = (code, members) =>
  updateDoc(doc(db,"houses",code), { members: clean(members) });

/* The house's barcode book: products no database knew, named by a member.
   Keyed by the barcode itself, so scanning the same box anywhere in the house
   resolves without another lookup — and without anyone naming it twice. */
const putBarcode = (code, entry) => setDoc(doc(db,"houses",code,"barcodes",String(entry.id)), clean(entry));

const putPantry  = (code, item) => setDoc(doc(db,"houses",code,"pantry",item.id), clean(item));
const dropPantry = (code, id)   => deleteDoc(doc(db,"houses",code,"pantry",id));
const putTrip    = (code, t)    => setDoc(doc(db,"houses",code,"trips",t.id), clean(t));
const putPayment = (code, p)    => setDoc(doc(db,"houses",code,"payments",p.id), clean(p));

const codeTaken = code => getDoc(doc(db,"houseCodes",code)).then(d => d.exists());

/* Deleting a house takes its pantry, receipts and balances with it, for
   everyone. Subcollections don't cascade in Firestore, so they're cleared
   explicitly before the house document and its code entry. */
async function deleteHouse(code){
  /* ORDER MATTERS. Permission checks for a house's contents read the house
     document, so it must be deleted LAST. The name entry is attempted FIRST
     (the admin can delete it while the house exists) and again at the END (once
     the house is gone, anyone may clear an entry pointing at nothing). Either
     route works, so a name can't be stranded whichever way we came in. */
  let nameCleared = false;
  try { await deleteDoc(doc(db,"houseCodes",code)); nameCleared = true; } catch(e){}
  for(const sub of ["pantry","trips","payments","barcodes","joinRequests"]){
    try {
      const snap = await getDocs(collection(db,"houses",code,sub));
      await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
    } catch(e){ /* nothing readable there, or not permitted — keep going */ }
  }
  await deleteDoc(doc(db,"houses",code));
  if(!nameCleared) await deleteDoc(doc(db,"houseCodes",code));
}

/* Used both by an admin removing someone and by a member letting themselves
   out. The rules decide which of those is allowed. */
async function removeMember(code, uid){
  const ref = doc(db,"houses",code);
  const snap = await getDoc(ref);
  if(!snap.exists()) return;
  const h = snap.data();
  await updateDoc(ref, {
    memberIds: (h.memberIds || []).filter(x => x !== uid),
    members:   (h.members   || []).filter(m => m.id !== uid)
  });
}

window.HC_SYNC = {
  ready: true, signInWithGoogle, completeRedirect, redirectPending, clearRedirecting,
  signInWithGoogleIdToken, onUser, signOutFirebase: () => signOut(auth),
  watchHouses, watchMyRequest, peekHouse, createHouse, requestJoin, cancelJoin,
  approveJoin, denyJoin, setMembers, putPantry, dropPantry, putTrip, putPayment, putBarcode,
  codeTaken, nameTaken, myHouseCodes, releaseCode, renameHouse, ensureNameIndex, deleteHouse, removeMember, stop
};
window.dispatchEvent(new Event("hc-sync-ready"));
