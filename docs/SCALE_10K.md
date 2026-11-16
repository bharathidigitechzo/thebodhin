# Bodhin at 10,000+ people online at the same time

**Decision (Nov 14, 2026):** LiveKit only, for every live class. BigBlueButton is not used.
**Target:** 10,000 or more people using Bodhin at the same moment, across learning, browsing, buying and live classes. That includes about 10,000 people in live classes at once, for example 200 batch classes of 50, or one mega class.

## Verdict per layer

| Layer | Handles 10K? | How |
|---|---|---|
| Website and app screens | ✅ | Static files on a CDN (Vercel). Visitors never hit a server to load screens. |
| Recorded videos | ✅ | HLS from a video CDN (Bunny Stream, Cloudflare Stream or Mux) with short-lived signed URLs. Never served from the app server. |
| Database and API (Supabase) | ✅ after the steps below | Connection pooler, indexes (migration 0008), and the right compute size picked from the load test |
| Live classes, many classes at once | ✅ | LiveKit across several nodes. Each class (room) runs on one node, and rooms spread over nodes. |
| Live classes, one very big class | ✅ with broadcast overflow | The first 1,000 learners (Super Admin can change this) are interactive. Everyone after that gets **Broadcast view**: HLS through the CDN, 5–10 seconds behind, with Q&A and polls still working. |
| Burst of joins at class start | ✅ | The seat decision in SQL holds a per-class lock. The app retries with backoff and jitter. |

## Why one class has a seat limit

In LiveKit's own benchmark, one 16-core node (`c2-standard-16`) carried a single room with 1 video publisher and 3,000 subscribers at 92% CPU. A room cannot span nodes on a self-hosted setup. Bodhin therefore keeps a margin: interactive seats default to **1,000** per class, adjustable from 50 to 2,500 under Super Admin → Platform rules → Live classes. Learners past that number watch the broadcast copy, which LiveKit Egress produces as HLS on the CDN. A CDN serves any number of viewers.

| Who | Seat |
|---|---|
| Tutor (host) | Always interactive |
| Learner the tutor allowed to speak | Always interactive (moved up if they were on broadcast) |
| Learner, seats left | Interactive: video, chat, Q&A, polls, raise hand, reactions |
| Learner, class full | Broadcast: video 5–10 s behind, Q&A (1 question per 30 s), polls. No open chat, mic or camera. |
| Rejoin | Keeps the same seat type |

## What is built (in this repo)

| Item | File |
|---|---|
| Seat rules, backoff with jitter, retry | `apps/student/src/live/scale.ts` |
| Join decides the seat; Broadcast view in the live room; join retry message ("Many learners are joining…") | `api/client.ts` (`liveTab.join`), `app/live-room/[id].tsx` |
| Super Admin setting "Interactive seats per class" | `app/admin/settings.tsx` |
| SQL: seats per class with a per-class advisory lock; rejoin keeps the seat; speakers are promoted | `supabase/migrations/0008_scale.sql` (`live_join_check`) |
| SQL: an index on **every** foreign key (Postgres doesn't add them), plus hot-path indexes | `0008_scale.sql` |
| Token function: broadcast viewers get an HLS address and no media token; `503 busy` lets the app retry | `supabase/functions/live-token/index.ts` |
| Load-test kit | `tests/load/` |

### Tests run here

| Test | Result |
|---|---|
| `tests/business/live-scale.test.ts` | 16/16: 10,000 joiners → 1,000 interactive + 9,000 broadcast; backoff and jitter; no retry on a real "no"; admin limits |
| `supabase/tests/db_test.py` | 195/195: every foreign key indexed; 50 seats → 49 + Lena interactive, rest broadcast; rejoin; host; speaker promotion |
| `supabase/tests/seat_race_test.py` | 400 learners join at once over 80 parallel connections, seats = 100 → exactly 100 interactive, never overfilled (~300 joins per second on a small local Postgres) |
| `tests/e2e/live_scale.py` | Browser check of interactive vs broadcast view, the Q&A limit and the admin setting |

**Not tested here:** real LiveKit nodes, real Egress/HLS, a real CDN, Supabase cloud limits, or 10,000 real connections. These need staging servers. The load-test kit below exists for that.

## Developer setup for 10K

1. **LiveKit:** pick one.
   - **LiveKit Cloud:** least work; scaling and TURN are managed. Check its current plan limits for participants and egress.
   - **Self-host:** at least 3 media nodes (16-core, compute-optimised, good bandwidth) + Redis (multi-node routing) + TURN/TLS on 443 + 1 Egress node for HLS. Put the servers in an Indian region (Mumbai) for latency.
   - Enable simulcast and dynacast (on by default in the LiveKit client SDK).
2. **Egress to HLS:** when a class has more joiners than seats, start a room-composite egress to HLS segments in object storage behind the CDN, at `LIVE_HLS_BASE/<room>/index.m3u8`. Set `LIVE_HLS_BASE` in the Edge Function secrets.
3. **Supabase:**
   - Plan: Pro with the spend cap removed, or Team. Their Realtime limit is 10,000 concurrent connections. Bodhin's class chat runs on LiveKit's data channel, not Supabase Realtime, so Realtime is needed only for small things such as notifications.
   - Edge Functions and any server code must connect through the **transaction pooler** (Supavisor), never directly.
   - Run migration `0008_scale.sql`.
   - Choose the compute size from the load test, not by guessing.
   - Add a read replica if dashboards or reports slow down the main database.
4. **Video on demand:** upload to a video CDN, play with signed URLs that expire within hours, and never proxy video through Supabase.
5. **Rate limits:** login/OTP, `live-token`, Q&A posting and payments, at the edge (Vercel or Cloudflare) and in the functions.
6. **Payments:** make gateway webhooks idempotent (`gateway_events` table) and process them on a queue, so that a sale-day spike cannot double-enrol anyone.
7. **Monitoring:** Sentry (app errors), Supabase metrics (CPU, connections, slow queries), LiveKit dashboards (node CPU, packet loss), and CDN hit ratio. Set alerts before the pilot.

## Load-test plan (staging only, never production)

| Test | Command | Pass if |
|---|---|---|
| 10,000 learners using the app, plus a burst of 3,000 class joins | `k6 run -e SUPABASE_URL=… -e ANON_KEY=… -e TOKENS=tokens.txt -e COURSE_ID=… -e LESSON_ID=… -e SESSION_ID=… tests/load/api_10k.js` | Errors < 1%, reads p95 < 800 ms, p99 < 2 s, joins p95 < 1.5 s |
| One class at the seat limit (1 tutor + 1,000) | `bash tests/load/live_10k.sh one-class` | Node CPU < 80%, no subscriber failures |
| Active class (6 on video + 300) | `bash tests/load/live_10k.sh speakers` | Smooth video, CPU < 80% |
| 200 classes × 50 = 10,000 | `bash tests/load/live_10k.sh many-rooms` (split `ROOM_FROM`/`ROOM_TO` across machines) | Rooms spread over nodes, no node > 80% CPU |
| 10,000 broadcast viewers | `k6 run -e HLS=…/index.m3u8 tests/load/hls_viewers.js` | Errors < 0.5%, p95 < 1 s (CDN) |

Run the load generator on separate, strong machines (`ulimit -n 65535`). Do not run it on the server under test. Load-test traffic counts toward LiveKit and Supabase usage.
