#!/usr/bin/env node
/**
 * Variable-concurrency end-to-end order flow load test.
 *
 * Each worker runs: register → catalog → cart → place order (202) → get order.
 * Env knobs (defaults shown):
 *   API_BASE=http://127.0.0.1:3001/v1
 *   CONCURRENCY=10     parallel in-flight flows
 *   TOTAL=50           total flows to complete
 *   PAYMENT_TYPE=COD
 *
 * Example:
 *   CONCURRENCY=20 TOTAL=100 npm run load:flow
 *
 * Design note: this exercises the HTTP accept path. At multi-million scale,
 * Kafka/outbox + workers absorb post-accept work (see docs/LOAD-TESTING.md).
 */

import { randomUUID } from 'crypto';

const API_BASE = (process.env.API_BASE || 'http://127.0.0.1:3001/v1').replace(/\/$/, '');
const CONCURRENCY = Math.max(1, Number(process.env.CONCURRENCY || 10));
const TOTAL = Math.max(1, Number(process.env.TOTAL || 50));
const PAYMENT_TYPE = process.env.PAYMENT_TYPE || 'COD';

/** @typedef {{ ok: boolean, flowMs: number, steps: Record<string, number>, orderId?: string, status?: string, error?: string, worker: number }} FlowResult */

/**
 * @param {string} path
 * @param {RequestInit & { headers?: Record<string, string> }} [init]
 */
async function api(path, init = {}) {
  const started = performance.now();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init.headers || {}),
    },
  });
  const ms = performance.now() - started;
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    const msg =
      typeof body?.message === 'string'
        ? body.message
        : Array.isArray(body?.message)
          ? body.message.join('; ')
          : text || res.statusText;
    const err = new Error(`${init.method || 'GET'} ${path} → ${res.status}: ${msg}`);
    err.status = res.status;
    err.ms = ms;
    throw err;
  }
  return { body, ms, status: res.status };
}

/**
 * @param {number} worker
 * @param {number} seq
 * @returns {Promise<FlowResult>}
 */
async function runFlow(worker, seq) {
  const flowStarted = performance.now();
  /** @type {Record<string, number>} */
  const steps = {};
  const stamp = `${Date.now()}_${worker}_${seq}_${randomUUID().slice(0, 8)}`;
  const email = `load_${stamp}@example.com`;
  const phone = `+92300${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;
  const password = 'LoadTest123!';

  try {
    const reg = await api('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: `Load User ${worker}-${seq}`,
        email,
        phone,
        password,
      }),
    });
    steps.register = reg.ms;
    const token = reg.body.accessToken;
    if (!token) throw new Error('register: missing accessToken');

    const catalog = await api('/catalog/products?page=1&limit=5', {
      headers: { Authorization: `Bearer ${token}` },
    });
    steps.catalog = catalog.ms;
    const product = (catalog.body.products || []).find((p) => (p.variants || []).length > 0);
    if (!product) throw new Error('catalog: no product with variants');
    const variant = product.variants[0];

    const cart = await api('/cart/items', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        productId: product.id,
        variantId: variant.id,
        quantity: 1,
      }),
    });
    steps.cart = cart.ms;

    const place = await api('/orders', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Idempotency-Key': randomUUID(),
      },
      body: JSON.stringify({ paymentType: PAYMENT_TYPE }),
    });
    steps.place = place.ms;
    if (place.status !== 202) {
      throw new Error(`place: expected 202, got ${place.status}`);
    }
    const orderId = place.body.orderId;
    if (!orderId) throw new Error('place: missing orderId');

    const get = await api(`/orders/${orderId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    steps.get = get.ms;

    return {
      ok: true,
      flowMs: performance.now() - flowStarted,
      steps,
      orderId,
      status: get.body.status || place.body.status,
      worker,
    };
  } catch (err) {
    return {
      ok: false,
      flowMs: performance.now() - flowStarted,
      steps,
      error: err instanceof Error ? err.message : String(err),
      worker,
    };
  }
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

function fmt(ms) {
  return `${ms.toFixed(1)}ms`;
}

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  Food Order App — concurrent order-flow load test              ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`  API_BASE     ${API_BASE}`);
  console.log(`  CONCURRENCY  ${CONCURRENCY}`);
  console.log(`  TOTAL        ${TOTAL}`);
  console.log(`  PAYMENT      ${PAYMENT_TYPE}`);
  console.log('');

  // Warm-up: catalog must be reachable
  try {
    await api('/catalog/products?page=1&limit=1');
  } catch (err) {
    console.error('Gateway not reachable. Start stack first: npm run dev:up');
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  /** @type {FlowResult[]} */
  const results = [];
  let next = 0;
  const wallStart = performance.now();

  async function worker(id) {
    while (true) {
      const seq = next++;
      if (seq >= TOTAL) return;
      const r = await runFlow(id, seq);
      results.push(r);
      const mark = r.ok ? '✓' : '✗';
      process.stdout.write(
        `  [${String(results.length).padStart(String(TOTAL).length)}/${TOTAL}] ${mark} worker=${id} ${fmt(r.flowMs)}${r.ok ? ` order=${r.orderId?.slice(0, 8)}…` : ` ${r.error}`}\n`,
      );
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i + 1)));
  const wallMs = performance.now() - wallStart;

  const ok = results.filter((r) => r.ok);
  const fail = results.filter((r) => !r.ok);
  const flowTimes = ok.map((r) => r.flowMs).sort((a, b) => a - b);
  const placeTimes = ok.map((r) => r.steps.place || 0).sort((a, b) => a - b);

  const stepKeys = ['register', 'catalog', 'cart', 'place', 'get'];
  const stepStats = Object.fromEntries(
    stepKeys.map((k) => {
      const vals = ok.map((r) => r.steps[k] || 0).sort((a, b) => a - b);
      return [
        k,
        {
          avg: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0,
          p95: percentile(vals, 95),
        },
      ];
    }),
  );

  console.log('');
  console.log('──────────────────────── RESULTS ────────────────────────');
  console.log(`  Completed flows     ${results.length}`);
  console.log(`  Successful          ${ok.length} (${((ok.length / results.length) * 100).toFixed(1)}%)`);
  console.log(`  Failed              ${fail.length}`);
  console.log(`  Wall clock          ${fmt(wallMs)}`);
  console.log(`  Throughput          ${((ok.length / wallMs) * 1000).toFixed(2)} successful flows/s`);
  console.log('');
  console.log('  End-to-end flow latency (register → get order)');
  if (flowTimes.length) {
    console.log(`    min / avg / p50 / p95 / p99 / max`);
    console.log(
      `    ${fmt(flowTimes[0])} / ${fmt(flowTimes.reduce((a, b) => a + b, 0) / flowTimes.length)} / ${fmt(percentile(flowTimes, 50))} / ${fmt(percentile(flowTimes, 95))} / ${fmt(percentile(flowTimes, 99))} / ${fmt(flowTimes[flowTimes.length - 1])}`,
    );
  }
  console.log('');
  console.log('  POST /orders accept latency (HTTP 202 — Kafka absorbs async work)');
  if (placeTimes.length) {
    console.log(
      `    avg ${fmt(placeTimes.reduce((a, b) => a + b, 0) / placeTimes.length)} · p95 ${fmt(percentile(placeTimes, 95))} · max ${fmt(placeTimes[placeTimes.length - 1])}`,
    );
  }
  console.log('');
  console.log('  Step averages (successful flows)');
  for (const k of stepKeys) {
    console.log(`    ${k.padEnd(10)} avg ${fmt(stepStats[k].avg)} · p95 ${fmt(stepStats[k].p95)}`);
  }

  if (fail.length) {
    console.log('');
    console.log('  Failure samples (up to 8)');
    for (const f of fail.slice(0, 8)) {
      console.log(`    · ${f.error}`);
    }
  }

  console.log('');
  console.log('  High-concurrency design (this test validates the accept path):');
  console.log('    • Message queues (Kafka) for order processing after 202');
  console.log('    • Horizontal scale via Docker/K8s replicas (stateless Nest services)');
  console.log('    • Background workers for email/SMS/push (notification service)');
  console.log('    • Indexes + schema via TypeORM migrations; Redis for cart/catalog cache');
  console.log('─────────────────────────────────────────────────────────');
  console.log('');

  process.exit(fail.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
