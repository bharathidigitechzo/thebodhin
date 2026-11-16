# Live classes — open source, no third-party branding

**Engine:** [LiveKit](https://github.com/livekit/livekit) server, Apache-2.0, self-hosted. We use only the headless
`livekit-client` SDK; every pixel (stage, chat, Q&A, polls, whiteboard, controls) is Bodhin's own UI, so no
logo / watermark / "powered by" is drawn. (Jitsi and BigBlueButton were rejected: both ship their own UI and branding.)

## What runs where
| Piece | File |
|---|---|
| Message protocol, validation, rate limit, token grants | `apps/student/src/live/protocol.ts` (pure, unit-tested) |
| LiveKit adapter | `apps/student/src/live/livekit.ts` |
| Video element | `apps/student/src/ui/RoomVideo.tsx` |
| Join rule (enrolled, window, plan, kill-switch) | SQL `public.live_join_check()` in `migrations/0005_live.sql` |
| Token signer | `supabase/functions/live-token/index.ts` |

Students join **listen-only**; the host approves a raised hand (`live_speakers` row) and the next token carries `canPublish`.
Host-only messages (slides, polls, whiteboard, answers) are dropped by every receiver if a student sends them.

## Turn it on
1. A small VPS (4 vCPU / 8 GB handles ~300 viewers per room): install LiveKit server with its install script, TLS via Caddy, domain `live.thebodhin.com`. Open UDP 50000–60000 + TCP 443/7881.
2. `supabase secrets set LIVEKIT_API_KEY=… LIVEKIT_API_SECRET=… LIVEKIT_URL=wss://live.thebodhin.com`
3. `supabase functions deploy live-token`
4. In `client.ts`, make `liveTab.join` / `liveAdmin.joinHost` call `live-token` and return `{ provider: 'livekit', url, token }`. The screens switch automatically: `provider: 'mock'` (today's default) = the scripted POC room.
5. Recording: LiveKit Egress (room composite → object storage), then write `live_sessions.recording_path`.
6. Native apps: add `@livekit/react-native` + `@livekit/react-native-webrtc`, EAS development build (not Expo Go).

## Cost guide
Self-hosted: server cost only (bandwidth dominates). LiveKit Cloud is an alternative but is a paid third-party service.
