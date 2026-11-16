// k6: 10,000 broadcast viewers pulling the HLS copy of one class from the CDN (tests the CDN, not LiveKit).
// Run: k6 run -e HLS=https://cdn-staging.thebodhin.com/live/<room>/index.m3u8 hls_viewers.js
import http from 'k6/http';
import { check, sleep } from 'k6';
export const options = { vus: 10000, duration: '10m', thresholds: { http_req_failed: ['rate<0.005'], http_req_duration: ['p(95)<1000'] } };
export default function () {
  const pl = http.get(__ENV.HLS);
  check(pl, { playlist: (r) => r.status === 200 });
  const seg = (pl.body || '').split('\n').filter((l) => l && !l.startsWith('#')).pop();
  if (seg) check(http.get(new URL(seg, __ENV.HLS).toString()), { segment: (r) => r.status === 200 });
  sleep(4); // players fetch a new segment every few seconds
}
