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

  GOOGLE_CLIENT_ID: "31443710417-7hp07hfdg0977mvrfgi2r0cvbrt4estp.apps.googleusercontent.com",

  /* Firestore — what makes a house code work on someone else's phone.
     Public config, not a secret: it ships in the page. Access is controlled
     by firestore.rules, not by hiding these values. */
  FIREBASE: {
    apiKey: "AIzaSyDT7trWpRL7TQndRLkHz2ps_Q6KDy2E3ZE",
    authDomain: "housecart-503516.firebaseapp.com",
    projectId: "housecart-503516",
    storageBucket: "housecart-503516.firebasestorage.app",
    messagingSenderId: "31443710417",
    appId: "1:31443710417:web:aebe0e2f71985395a830f0"
  },

  /* Master switch for cloud sync.
     Append ?local=1 to the URL to force the app onto local storage only — handy
     for poking at the UI without touching real data, and it's how the automated
     tests exercise everything without needing Google credentials. */
  USE_FIREBASE: !/[?&]local=1\b/.test(location.search)
};
