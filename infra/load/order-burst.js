/**
 *  Documentation §17 — order burst: assert 202 latency stays flat; Kafka absorbs load.
 * Requires ACCESS_TOKEN + Idempotency-Key per VU iteration.
 * Run: ACCESS_TOKEN=... k6 run infra/load/order-burst.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

export const options = {
  scenarios: {
    order_burst: {
      executor: 'ramping-arrival-rate',
      startRate: 5,
      timeUnit: '1s',
      preAllocatedVUs: 50,
      maxVUs: 200,
      stages: [
        { duration: '30s', target: 20 },
        { duration: '1m', target: 80 },
        { duration: '30s', target: 5 },
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(99)<100'],
    http_req_failed: ['rate<0.05'],
  },
};

const BASE = __ENV.API_BASE || 'http://localhost:3001/v1';
const TOKEN = __ENV.ACCESS_TOKEN || '';

export default function () {
  const res = http.post(
    `${BASE}/orders`,
    JSON.stringify({ paymentType: 'COD' }),
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TOKEN}`,
        'Idempotency-Key': uuidv4(),
      },
    },
  );
  check(res, {
    'accepted 202': (r) => r.status === 202,
  });
  sleep(0.05);
}
