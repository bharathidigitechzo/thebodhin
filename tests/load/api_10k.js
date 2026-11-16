// k6 load test: 10,000 learners online at once against STAGING (never production).
// Run:  k6 run -e SUPABASE_URL=https://<staging>.supabase.co -e ANON_KEY=<anon key> -e TOKENS=tokens.txt \
//          -e COURSE_ID=<uuid> -e LESSON_ID=<uuid> -e SESSION_ID=<live session uuid> api_10k.js
// (test learners must be enrolled in COURSE_ID)
// tokens.txt = one signed-in test learner JWT per line (make them with the seed script; never real users).
// Pass = p95 under 800 ms, p99 under 2 s, errors under 1 %, at 10,000 concurrent users.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import encoding from 'k6/encoding';

const URL = __ENV.SUPABASE_URL;
const KEY = __ENV.ANON_KEY;
const tokens = new SharedArray('tokens', () => open(__ENV.TOKENS || 'tokens.txt').split('\n').filter(Boolean));

export const options = {
  scenarios: {
    learners: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '5m', target: 2000 },
        { duration: '5m', target: 10000 },
        { duration: '15m', target: 10000 }, // hold at 10k
        { duration: '3m', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
    // class-start burst: 3,000 learners pressing Join within 60 seconds
    join_burst: {
      executor: 'ramping-arrival-rate',
      startTime: '12m',
      timeUnit: '1s',
      preAllocatedVUs: 3000,
      stages: [{ duration: '60s', target: 50 }, { duration: '30s', target: 0 }],
      exec: 'joinClass',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{kind:read}': ['p(95)<800', 'p(99)<2000'],
    'http_req_duration{kind:write}': ['p(95)<1200'],
    'http_req_duration{kind:join}': ['p(95)<1500'],
  },
};

const h = () => ({ headers: { apikey: KEY, Authorization: `Bearer ${tokens[(__VU - 1) % tokens.length]}`, 'Content-Type': 'application/json' } });
const get = (path) => http.get(`${URL}/rest/v1/${path}`, { ...h(), tags: { kind: 'read' } });

export default function () {
  // what a learner does in a session: home → explore → a course → my learning → progress save
  check(get('courses?select=id,title,price_inr,tenant_id&status=eq.published&visibility=neq.private&limit=24'), { 'explore 200': (r) => r.status === 200 });
  sleep(2 + Math.random() * 3);
  check(get('enrollments?select=course_id,created_at&limit=50'), { 'my courses 200': (r) => r.status === 200 });
  sleep(2 + Math.random() * 3);
  check(get('live_sessions?select=id,title,starts_at,ends_at&status=eq.scheduled&order=starts_at&limit=20'), { 'live list 200': (r) => r.status === 200 });
  sleep(5 + Math.random() * 10); // watching a lesson
  // save lesson position (upsert; RLS only lets a learner write their own row)
  const me = JSON.parse(encoding.b64decode(tokens[(__VU - 1) % tokens.length].split('.')[1], 'rawurl', 's')).sub;
  const body = JSON.stringify({ user_id: me, lesson_id: __ENV.LESSON_ID, course_id: __ENV.COURSE_ID, position_sec: Math.floor(Math.random() * 600) });
  const ph = h(); ph.headers.Prefer = 'resolution=merge-duplicates,return=minimal';
  const pr = http.post(`${URL}/rest/v1/lesson_progress`, body, { ...ph, tags: { kind: 'write' } });
  check(pr, { 'progress saved': (r) => r.status < 300 });
  sleep(10 + Math.random() * 20);
}

export function joinClass() {
  const r = http.post(`${URL}/functions/v1/live-token`, JSON.stringify({ sessionId: __ENV.SESSION_ID }), { ...h(), tags: { kind: 'join' } });
  check(r, { 'join answered': (x) => x.status === 200 || x.status === 503, 'seat decided': (x) => x.status !== 200 || ['interactive', 'broadcast'].includes(x.json('mode')) });
}
