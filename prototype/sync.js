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
  getAuth, GoogleAuthProvider, signInWithCredential, onAuthStateChanged, signOut
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

/* Exchange the ID token the Google button already produced for a Firebase
   session, so the OAuth client ID Kaylee set up earlier carries straight over
   and nobody signs in twice. */
async function signInWithGoogleIdToken(idToken){
  const cred = GoogleAuthProvider.credential(idToken);
  const { user } = await signInWithCredential(auth, cred);
  return { id:user.uid, name:user.displayName || user.email, email:user.email,
           pic:user.photoURL || "", venmo:"" };
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
        pending: prev.pending || [] };

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
  }, err => { console.warn("houses", err.code); onChange(err); }));

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
    name, adminId: member.id, adminName: member.name, createdAt: Date.now()
  }));
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

const putPantry  = (code, item) => setDoc(doc(db,"houses",code,"pantry",item.id), clean(item));
const dropPantry = (code, id)   => deleteDoc(doc(db,"houses",code,"pantry",id));
const putTrip    = (code, t)    => setDoc(doc(db,"houses",code,"trips",t.id), clean(t));
const putPayment = (code, p)    => setDoc(doc(db,"houses",code,"payments",p.id), clean(p));

const codeTaken = code => getDoc(doc(db,"houseCodes",code)).then(d => d.exists());

/* Deleting a house takes its pantry, receipts and balances with it, for
   everyone. Subcollections don't cascade in Firestore, so they're cleared
   explicitly before the house document and its code entry. */
async function deleteHouse(code){
  for(const sub of ["pantry","trips","payments","joinRequests"]){
    const snap = await getDocs(collection(db,"houses",code,sub));
    await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
  }
  await deleteDoc(doc(db,"houses",code));
  await deleteDoc(doc(db,"houseCodes",code));
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
  ready: true, signInWithGoogleIdToken, onUser, signOutFirebase: () => signOut(auth),
  watchHouses, watchMyRequest, peekHouse, createHouse, requestJoin, cancelJoin,
  approveJoin, denyJoin, setMembers, putPantry, dropPantry, putTrip, putPayment,
  codeTaken, deleteHouse, removeMember, stop
};
window.dispatchEvent(new Event("hc-sync-ready"));
