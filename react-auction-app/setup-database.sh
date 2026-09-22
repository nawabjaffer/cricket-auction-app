#!/bin/bash

STARTED_AT=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
STARTED_SECONDS=$(date +%s)
trap 'exit_code=$?; ENDED_AT=$(date -u "+%Y-%m-%dT%H:%M:%SZ"); ENDED_SECONDS=$(date +%s); printf "[setup-database] endedAt=%s duration=%ss exitCode=%s\\n" "$ENDED_AT" "$((ENDED_SECONDS - STARTED_SECONDS))" "$exit_code"' EXIT
printf '[setup-database] startedAt=%s\\n' "$STARTED_AT"

echo "Please create Realtime Database manually:"
echo "1. Go to: https://console.firebase.google.com/project/e-auction-store/database"
echo "2. Click 'Create Database' for Realtime Database"
echo "3. Choose location: us-central1"
echo "4. Start in test mode (we'll deploy rules after)"
echo ""
echo "After creating, run: firebase deploy --only database"
