#!/bin/bash
# LiveKit load tests (STAGING). Needs the LiveKit CLI (`lk`) on a strong machine (ulimit -n 65535); split across machines if needed.
# Usage: LIVEKIT_URL=wss://live-staging.thebodhin.com LIVEKIT_API_KEY=... LIVEKIT_API_SECRET=... bash live_10k.sh <test>
set -e
ulimit -n 65535 || true
A="--url $LIVEKIT_URL --api-key $LIVEKIT_API_KEY --api-secret $LIVEKIT_API_SECRET"
case "$1" in
  one-class)   # one big interactive class at the seat limit: 1 tutor video + 1,000 listeners
    lk load-test $A --room bodhin-big --video-publishers 1 --subscribers 1000 --duration 10m ;;
  speakers)    # an active class: tutor + 5 learners on mic/video, 300 watching
    lk load-test $A --room bodhin-active --video-publishers 6 --subscribers 300 --duration 10m ;;
  many-rooms)  # platform-wide: 200 batch classes x 50 learners = 10,000 people (run from several machines, ROOM_FROM/ROOM_TO)
    for i in $(seq ${ROOM_FROM:-1} ${ROOM_TO:-200}); do
      lk load-test $A --room "bodhin-batch-$i" --video-publishers 1 --subscribers 49 --duration 15m &
      sleep 0.3
    done; wait ;;
  *) echo "usage: live_10k.sh one-class|speakers|many-rooms"; exit 1 ;;
esac
