# Setup

> **Console navigation, checked against Google's docs on 2026-07-25.** Google
> reorganized both consoles: the old *APIs & Services → OAuth consent screen*
> page no longer exists (it's now **Google Auth Platform**, split into Branding /
> Audience / Clients), and Firebase moved Firestore under **Databases & Storage**.
> Button labels still drift between editions and rollouts — where that's likely,
> the alternate label is noted.

---

# Part 1 — Google sign-in ✅ DONE

Already wired up and deployed. Client ID
`31443710417-...apps.googleusercontent.com` is live in `prototype/config.js`.
Kept here for when you add a custom domain or need to re-check something.

You need an **OAuth 2.0 Web client ID**. The ID is not a secret — it's designed
to ship in public web pages. What protects it is the origins list in step 4.

### 1. Project
**https://console.cloud.google.com** → project dropdown (top left) → **New
project** → name it `HouseCart`. Make sure it stays selected afterwards.

### 2. Branding
Sidebar → **APIs & Services → Google Auth Platform → Branding**.
*(This replaced the old "OAuth consent screen" page.)*

- **App name:** HouseCart
- **User support email:** yours
- **Developer contact email:** yours

Don't add scopes. Sign-in only uses `openid`, `email`, `profile` — those are
automatic and don't get declared.

### 3. Audience ← the step that blocks housemates
**Google Auth Platform → Audience.** *(Publishing status used to live on the
consent screen page; it's here now.)*

- **User type** must be **External**.
- If **Publishing status** says **Testing**, only email addresses listed under
  *Test users* can sign in — everyone else gets **"Access blocked: this app is
  not accessible."**

Either click **Publish app** (no Google review needed for basic profile scopes —
it takes effect immediately), or add each housemate under **Test users**, max
100. Publishing is less hassle.

### 4. Clients → the client ID
**Google Auth Platform → Clients → Create client.**
*(Previously "Credentials → Create credentials → OAuth client ID".)*

- **Application type:** Web application
- **Name:** HouseCart web

Under **Authorized JavaScript origins**, add each of these — scheme and hostname
only, **no trailing slash, no path**:

```
https://gethousecart.vercel.app
https://housecart-kappa.vercel.app
http://localhost
http://localhost:8123
```

Leave **Authorized redirect URIs empty.** We use the JavaScript callback flow,
not a redirect.

> Adding your own domain later? Come back here and add it, or sign-in breaks on
> the new hostname with *"The given origin is not allowed for the given client ID."*

### 5. Paste it into `prototype/config.js`, commit, push
Vercel redeploys itself in about a minute.

### Troubleshooting

| Symptom | Cause |
|---|---|
| Setup card still showing | `config.js` empty, or deploy not finished |
| *"The given origin is not allowed for the given client ID"* | The URL you're on isn't in step 4. Check `https` vs `http`, no trailing slash |
| *"Access blocked: this app is not accessible"* | Publishing status is **Testing** and that person isn't a test user — step 3 |
| Button renders, click does nothing | Popup blocker, or third-party cookies blocked (Safari/Brave) |

---

# Part 2 — Shared households (not done yet)

**Why this is needed:** sign-in is real, but households live in each browser's
local storage. You create `MAPLE7` on your phone; your housemate signs in on
theirs, types `MAPLE7`, and gets *"No house with that code"* — that house only
exists in your browser. This is the last real gap.

The fix is **Firestore** in the same Google project. It keeps the app static on
Vercel — no server to run or pay for — and security rules keep each house's
receipts readable only by its members.

Your existing client ID isn't wasted: Firebase Auth can take the ID token the
Google button already produces and exchange it for a Firebase session
(`signInWithCredential`), so the sign-in you just set up carries straight over.

### 1. Add Firebase to the project you already made
**https://console.firebase.google.com** → **Create a project**. On that page look
for **"Add Firebase to Google Cloud project"** (it's at the *bottom* of the
create-project screen) and pick your existing **HouseCart** project.

Do it this way rather than making a fresh project — otherwise auth and database
end up in two different projects and the ID token won't validate.

You can skip Google Analytics and "Gemini in Firebase". Neither is needed.

### 2. Create the database
Sidebar → **Databases & Storage → Firestore**.
*(This used to be under "Build". Older guides — including the one I gave you
earlier — say "Build → Firestore Database", which no longer matches.)*

Click **Create database** (some projects show **Add database**), then:

- **Edition:** **Standard**. Enterprise is a heavier, pricier tier we don't need.
- **Database ID:** leave the default (`(default)`).
- **Location:** pick the one nearest you — `nam5 (us-central)` is fine for the
  US. **This can't be changed later.**
- **Starting mode:** **Production mode** (denies everything until rules are
  written). Nothing will work until I deploy rules — that's expected and correct.
  Don't pick Test mode; it leaves your data world-readable for 30 days.

### 3. Register the web app and copy the config
Firebase console → **Project settings** (gear, top left) → **General** → scroll
to **Your apps** → click the **Web** icon `</>`.

- App nickname: `HouseCart web`
- **Don't** tick Firebase Hosting — Vercel is already hosting it.
- Click **Register app**.

You'll get a `firebaseConfig` object:

```js
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "housecart-xxxxx.firebaseapp.com",
  projectId: "housecart-xxxxx",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "1:...:web:..."
};
```

**Paste that whole object to me.** It's public config, not a secret — it ships in
the page like the client ID does. Access is controlled by security rules, which
I'll write.

### 4. Then I'll do the rest
- Add the Firebase SDK and swap the localStorage layer for Firestore
- Exchange the Google ID token for a Firebase session
- Write and deploy security rules: only members of a house can read or write it
- Keep an offline cache so the app still works in a store with bad signal
- Re-run the test suite against the real shared backend

### One decision I need from you
Right now **anyone with a house code can join a house.** Codes are short
(`MAPLE7`), so they're guessable — someone could stumble into your grocery
history. Options:

1. **Leave it open** — simplest, fine for a house of 3
2. **Longer random codes** — much harder to guess, still one-tap to join
3. **Approval** — joining raises a request an existing member approves

Tell me which and I'll build it in.
