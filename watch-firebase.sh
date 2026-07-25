#!/usr/bin/env bash
# Fires ONLY when anonymous sign-in actually works (i.e. I can run a real
# two-user Firestore test). ADMIN_ONLY_OPERATION / CONFIGURATION_NOT_FOUND are
# both "still waiting" and must stay silent.
K=AIzaSyDT7trWpRL7TQndRLkHz2ps_Q6KDy2E3ZE
while true; do
  r=$(curl -s -X POST "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=$K" \
        -H 'Content-Type: application/json' -d '{"returnSecureToken":true}' 2>/dev/null || echo '{}')
  if echo "$r" | grep -q '"idToken"'; then
    echo "FIREBASE-ANON-READY — anonymous sign-in works; running the real two-user sync test now"
    exit 0
  fi
  sleep 45
done
