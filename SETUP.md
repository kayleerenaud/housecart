# Turning on Google sign-in

You need one thing from Google: an **OAuth 2.0 Web client ID**. It's free, takes
about five minutes, and the ID is not a secret — it's meant to ship in public web
pages. What keeps it safe is the origins list you pin it to in step 5.

## 1. Make a project
Go to **https://console.cloud.google.com**. Top-left project dropdown → **New
project**. Name it `HouseCart`. Create, then make sure it's the selected project
(the dropdown should say HouseCart).

## 2. Fill in the branding / consent screen
Left sidebar → **APIs & Services → OAuth consent screen**. Google won't let you
create a client without this.

- **User type:** External
- **App name:** HouseCart
- **User support email:** your email
- **Developer contact email:** your email

Save and continue. **Scopes:** skip — don't add any. The sign-in button only
uses the three basic ones (`openid`, `email`, `profile`), which are automatic
and don't need declaring. Save through to the end.

## 3. Publish it (important, easy to miss)
Still on **OAuth consent screen**, look at *Publishing status*.

If it says **Testing**, only email addresses you've explicitly listed can sign
in — your housemates will get "Access blocked: this app is not accessible". Two
options:

- **Click "Publish app".** For an app using only basic profile scopes, this
  needs no Google review — it goes live immediately.
- Or stay in Testing and add each housemate under **Test users** (limit 100).

Publishing is simpler. Either works.

## 4. Create the client ID
**APIs & Services → Credentials → + Create credentials → OAuth client ID**.

- **Application type:** Web application
- **Name:** HouseCart web

## 5. Add the authorized origins
This is the step that actually matters. Under **Authorized JavaScript origins**,
click *Add URI* for each of these — scheme and hostname only, **no trailing
slash, no path**:

```
https://gethousecart.vercel.app
https://housecart-kappa.vercel.app
http://localhost
http://localhost:8123
```

Leave **Authorized redirect URIs completely empty.** We use the JavaScript
callback flow, not a redirect — adding one here does nothing and confuses things
later.

Click **Create**. Copy the client ID (ends in `.apps.googleusercontent.com`).

> When you add your own domain later, come back and add it here too, or sign-in
> will break on the new hostname with "The given origin is not allowed".

## 6. Paste it in
Open **`prototype/config.js`** — the only file you need to touch:

```js
window.HOUSECART_CONFIG = {
  GOOGLE_CLIENT_ID: "PASTE_IT_HERE",
  FIREBASE: null
};
```

Commit and push. Vercel redeploys on its own in about a minute. Reload the site
and the real Google button appears where the setup card was.

## If something goes wrong

| What you see | What it means |
|---|---|
| Setup card still showing | `config.js` is still empty, or the deploy hasn't finished |
| Console: *"The given origin is not allowed for the given client ID"* | The URL you're visiting isn't in step 5's list. Check for `https` vs `http`, and no trailing slash |
| *"Access blocked: this app is not accessible"* | Publishing status is still **Testing** and that person isn't a test user — see step 3 |
| Button appears, nothing happens on click | Usually a popup blocker, or a third-party-cookie blocker in Safari/Brave |
| *"idpiframe_initialization_failed"* | Third-party cookies blocked in the browser |

---

# The thing to know before you invite anyone

Google sign-in is real, but **households are still stored in each browser's
local storage.** So:

- You create house `MAPLE7` on your phone. ✅
- Your housemate signs in on *their* phone and types `MAPLE7`. ❌ "No house with
  that code" — because that house only exists in your browser.

Sign-in being real doesn't fix this; it needs a shared database. The natural fit
is **Firestore**, in the same Google project you just made:

1. Go to **https://console.firebase.google.com** → *Add project* → pick the
   existing **HouseCart** project.
2. **Build → Firestore Database → Create database** → Production mode.
3. **Project settings → General → Your apps → Web app (`</>`)** → register it →
   copy the `firebaseConfig` object.
4. Send me that object and I'll wire it in. It's public config, not a secret.

That swaps localStorage for a real shared store, keeps the whole thing static on
Vercel (no server to run), and enforces access with Firestore security rules so
only members of a house can read its receipts.
