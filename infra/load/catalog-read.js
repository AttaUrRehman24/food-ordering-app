/**
 *  Documentation §17 — catalog read baseline (p99 < 200ms target framing).
 * Run: k6 run infra/load/catalog-read.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    catalog_baseline: {
      executor: 'constant-arrival-rate',
      rate: 50,
      timeUnit: '1s',
      duration: '2m',
      preAllocatedVUs: 20,
      maxVUs: 100,
    },
  },
  thresholds: {
    http_req_duration: ['p(99)<200'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE = __ENV.API_BASE || 'http://localhost:3001/v1';

export default function () {
  const res = http.get(`${BASE}/catalog/products?page=1&limit=20`);
  check(res, {
    'status 200': (r) => r.status === 200,
  });
  sleep(0.1);
}
