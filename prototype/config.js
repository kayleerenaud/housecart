/* ══════════════════════════════════════════════════════════════════
   HouseCart configuration — this is the ONLY file you need to edit.

   Paste the OAuth Web client ID from Google Cloud Console between the
   quotes below, save, commit, push. Vercel redeploys automatically.

   It looks like:
     "849213746501-a1b2c3d4e5f6g7h8.apps.googleusercontent.com"

   This value is NOT a secret — it's designed to ship in public web
   pages. The thing that keeps it safe is the Authorized JavaScript
   origins list in the console, which pins it to your domains.
   ══════════════════════════════════════════════════════════════════ */

window.HOUSECART_CONFIG = {

  GOOGLE_CLIENT_ID: "",

  /* Left empty for now. Fill this in and households start syncing
     between phones instead of living in one browser. Also not secret. */
  FIREBASE: null
  /* FIREBASE: {
       apiKey: "...",
       authDomain: "your-project.firebaseapp.com",
       projectId: "your-project",
       appId: "..."
     } */
};
