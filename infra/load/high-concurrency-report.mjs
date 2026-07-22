#!/usr/bin/env node
/**
 * High-concurrency full-stack report for Food Order App.
 *
 * Design target: 5,000,000 parallel order accepts (async / Kafka-absorbed).
 * Local runs execute a measurable burst (TOTAL × CONCURRENCY) then probe:
 *   Docker · Postgres · Redis · Kafka · notifications/email · gateway health
 * and write a full markdown + JSON report under infra/load/reports/.
 *
 * Env:
 *   API_BASE=http://127.0.0.1:3001/v1
 *   DESIGN_TARGET=5000000
 *   CONCURRENCY=50
 *   TOTAL=200              actual flows this machine will place
 *   SETTLE_MS=8000         wait for Kafka/workers before post-snapshot
 *   REPORT_DIR=infra/load/reports
 *   SKIP_LOAD=0            set 1 for infra-only probe
 *
 * Example:
 *   DESIGN_TARGET=5000000 CONCURRENCY=50 TOTAL=200 npm run load:concurrency-report
 */

import { randomUUID } from 'crypto';
import { execSync, spawnSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const API_BASE = (process.env.API_BASE || 'http://127.0.0.1:3001/v1').replace(/\/$/, '');
const DESIGN_TARGET = Math.max(1, Number(process.env.DESIGN_TARGET || 5_000_000));
const CONCURRENCY = Math.max(1, Number(process.env.CONCURRENCY || 50));
const TOTAL = Math.max(0, Number(process.env.TOTAL || 200));
const SETTLE_MS = Math.max(0, Number(process.env.SETTLE_MS || 8000));
const SKIP_LOAD = process.env.SKIP_LOAD === '1' || process.env.SKIP_LOAD === 'true';
const PAYMENT_TYPE = process.env.PAYMENT_TYPE || 'COD';
const REPORT_DIR = process.env.REPORT_DIR || join(process.cwd(), 'infra/load/reports');
const PG = process.env.PG_CONTAINER || 'food-ordering-postgres';
const REDIS = process.env.REDIS_CONTAINER || 'food-ordering-redis';
const KAFKA = process.env.KAFKA_CONTAINER || 'food-ordering-kafka';

function sh(cmd, opts = {}) {
  try {
    return execSync(cmd, {
      encoding: 'utf8',
      timeout: opts.timeout ?? 60_000,
      stdio: ['ignore', 'pipe', 'pipe'],
      ...opts,
    }).trim();
  } catch (err) {
    return `ERROR: ${err.stderr?.toString?.()?.trim() || err.message}`;
  }
}

function dockerOk() {
  const out = sh('docker info --format "{{.ServerVersion}}"');
  return !out.startsWith('ERROR');
}

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

function snapshotPostgres() {
  const sql = `SELECT json_build_object(
  'orders_total', (SELECT count(*)::int FROM orders),
  'orders_by_status', (SELECT coalesce(json_object_agg(status, c), '{}'::json) FROM (SELECT status, count(*)::int AS c FROM orders GROUP BY status) s),
  'order_items', (SELECT count(*)::int FROM order_items),
  'order_outbox_total', (SELECT count(*)::int FROM order_outbox),
  'order_outbox_unpublished', (SELECT count(*)::int FROM order_outbox WHERE published_at IS NULL),
  'order_idempotency', (SELECT count(*)::int FROM order_idempotency),
  'order_status_history', (SELECT count(*)::int FROM order_status_history),
  'users', (SELECT count(*)::int FROM users),
  'sessions', (SELECT count(*)::int FROM sessions),
  'notifications', (SELECT count(*)::int FROM notifications),
  'notification_delivery', (SELECT count(*)::int FROM notification_delivery),
  'notification_delivery_by_status', (
    SELECT coalesce(json_object_agg(status, c), '{}'::json)
    FROM (SELECT status::text AS status, count(*)::int AS c FROM notification_delivery GROUP BY status) d
  ),
  'products', (SELECT count(*)::int FROM products),
  'carts', (SELECT count(*)::int FROM carts)
) AS snap;`;
  try {
    const raw = execSync(`docker exec -i ${PG} psql -U food -d food_ordering -t -A`, {
      encoding: 'utf8',
      input: sql,
      timeout: 60_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return JSON.parse(raw);
  } catch (err) {
    return { error: err.stderr?.toString?.() || err.message };
  }
}

function snapshotRedis() {
  const info = sh(`docker exec ${REDIS} redis-cli INFO`);
  const keyspace = sh(`docker exec ${REDIS} redis-cli INFO keyspace`);
  const dbsize = sh(`docker exec ${REDIS} redis-cli DBSIZE`);
  const sampleKeys = sh(`docker exec ${REDIS} redis-cli --scan --count 40`);
  const used = (info.match(/used_memory_human:(\S+)/) || [])[1];
  const clients = (info.match(/connected_clients:(\d+)/) || [])[1];
  const ops = (info.match(/instantaneous_ops_per_sec:(\d+)/) || [])[1];
  const hits = (info.match(/keyspace_hits:(\d+)/) || [])[1];
  const misses = (info.match(/keyspace_misses:(\d+)/) || [])[1];
  const keys = sampleKeys
    .split('\n')
    .map((k) => k.trim())
    .filter(Boolean)
    .slice(0, 40);
  const cartKeys = keys.filter((k) => /cart/i.test(k)).length;
  const rlKeys = keys.filter((k) => k.startsWith('rl:')).length;
  const catalogKeys = keys.filter((k) => /catalog|product/i.test(k)).length;
  return {
    dbsize: Number(dbsize) || dbsize,
    used_memory_human: used,
    connected_clients: Number(clients) || clients,
    instantaneous_ops_per_sec: Number(ops) || ops,
    keyspace_hits: Number(hits) || hits,
    keyspace_misses: Number(misses) || misses,
    keyspace_raw: keyspace,
    sample_key_prefixes: {
      cartish: cartKeys,
      rate_limit: rlKeys,
      catalogish: catalogKeys,
      scanned: keys.length,
    },
    sample_keys: keys.slice(0, 25),
  };
}

function snapshotKafka() {
  const topics = sh(
    `docker exec ${KAFKA} /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --list`,
  );
  const topicList = topics
    .split('\n')
    .map((t) => t.trim())
    .filter((t) => t && !t.startsWith('ERROR'));
  const offsets = {};
  for (const topic of [
    'order.created',
    'order.status.changed',
    'order.paid',
    'order.failed',
    'payment.result',
    'user.otp.requested',
    'notification.email.DLQ',
  ]) {
    if (!topicList.includes(topic)) {
      offsets[topic] = { present: false };
      continue;
    }
    const describe = sh(
      `docker exec ${KAFKA} /opt/kafka/bin/kafka-get-offsets.sh --bootstrap-server localhost:9092 --topic ${topic} --time -1`,
    );
    offsets[topic] = { present: true, high_watermarks: describe };
  }
  const groups = sh(
    `docker exec ${KAFKA} /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server localhost:9092 --list`,
  );
  return {
    topics: topicList,
    offsets,
    consumer_groups: groups
      .split('\n')
      .map((g) => g.trim())
      .filter(Boolean),
  };
}

function snapshotDocker() {
  const ps = sh(
    `docker ps --filter name=food-ordering --format "{{.Names}}\\t{{.Status}}\\t{{.Ports}}"`,
  );
  const stats = sh(
    `docker stats --no-stream --format "{{.Name}}\\tCPU={{.CPUPerc}}\\tMEM={{.MemUsage}}" $(docker ps -q --filter name=food-ordering) 2>/dev/null || true`,
  );
  const composeScaleNote =
    'App Nest processes run on host in local mode; infra (postgres/redis/kafka/minio) is Docker. For true horizontal scale use Helm replicas or `docker compose up --scale <svc>=N` with containerized apps.';
  return {
    containers: ps
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [name, status, ports] = line.split('\t');
        return { name, status, ports };
      }),
    resource_stats: stats
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [name, cpu, mem] = line.split('\t');
        return { name, cpu, mem };
      }),
    horizontal_scaling_note: composeScaleNote,
  };
}

async function snapshotServices() {
  const ports = {
    web: 3000,
    gateway: 3001,
    identity: 3002,
    catalog: 3003,
    cart: 3004,
    order: 3005,
    notification: 3006,
    realtime: 3007,
  };
  const health = {};
  for (const [name, port] of Object.entries(ports)) {
    try {
      const path = name === 'web' ? '/' : '/health/live';
      const res = await fetch(`http://127.0.0.1:${port}${path}`, {
        signal: AbortSignal.timeout(2000),
      });
      health[name] = { port, status: res.status, ok: res.status < 500 };
    } catch (err) {
      health[name] = { port, ok: false, error: err.message };
    }
  }
  let metricsSample = null;
  try {
    const res = await fetch('http://127.0.0.1:3001/metrics', { signal: AbortSignal.timeout(3000) });
    const text = await res.text();
    const lines = text
      .split('\n')
      .filter((l) => /order|http_request|process_resident/i.test(l) && !l.startsWith('#'))
      .slice(0, 40);
    metricsSample = lines;
  } catch {
    metricsSample = [];
  }
  return { health, gateway_metrics_sample: metricsSample };
}

function diffNumeric(before, after, keys) {
  const out = {};
  for (const k of keys) {
    const b = Number(before?.[k] ?? 0);
    const a = Number(after?.[k] ?? 0);
    if (!Number.isNaN(b) && !Number.isNaN(a)) out[k] = { before: b, after: a, delta: a - b };
  }
  return out;
}

async function runFlow(worker, seq) {
  const flowStarted = performance.now();
  const steps = {};
  const stamp = `${Date.now()}_${worker}_${seq}_${randomUUID().slice(0, 8)}`;
  const email = `hc_${stamp}@example.com`;
  const phone = `+92301${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;
  try {
    const reg = await api('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: `HC ${worker}-${seq}`,
        email,
        phone,
        password: 'LoadTest123!',
      }),
    });
    steps.register = reg.ms;
    const token = reg.body.accessToken;
    const catalog = await api('/catalog/products?page=1&limit=5', {
      headers: { Authorization: `Bearer ${token}` },
    });
    steps.catalog = catalog.ms;
    const product = (catalog.body.products || []).find((p) => (p.variants || []).length);
    if (!product) throw new Error('no product');
    const variant = product.variants[0];
    const cart = await api('/cart/items', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ productId: product.id, variantId: variant.id, quantity: 1 }),
    });
    steps.cart = cart.ms;
    const place = await api('/orders', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Idempotency-Key': randomUUID() },
      body: JSON.stringify({ paymentType: PAYMENT_TYPE }),
    });
    steps.place = place.ms;
    if (place.status !== 202) throw new Error(`expected 202 got ${place.status}`);
    const get = await api(`/orders/${place.body.orderId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    steps.get = get.ms;
    return {
      ok: true,
      flowMs: performance.now() - flowStarted,
      steps,
      orderId: place.body.orderId,
      status: get.body.status,
    };
  } catch (err) {
    return {
      ok: false,
      flowMs: performance.now() - flowStarted,
      steps,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

async function runLoad() {
  if (SKIP_LOAD || TOTAL === 0) {
    return { skipped: true, results: [] };
  }
  const results = [];
  let next = 0;
  const wallStart = performance.now();
  async function worker(id) {
    while (true) {
      const seq = next++;
      if (seq >= TOTAL) return;
      const r = await runFlow(id, seq);
      results.push(r);
      if ((results.length % 25 === 0) || results.length === TOTAL) {
        process.stdout.write(`  load progress ${results.length}/${TOTAL}\n`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i + 1)));
  const wallMs = performance.now() - wallStart;
  const ok = results.filter((r) => r.ok);
  const fail = results.filter((r) => !r.ok);
  const flowTimes = ok.map((r) => r.flowMs).sort((a, b) => a - b);
  const placeTimes = ok.map((r) => r.steps.place || 0).sort((a, b) => a - b);
  const throughput = wallMs > 0 ? (ok.length / wallMs) * 1000 : 0;
  return {
    skipped: false,
    wallMs,
    completed: results.length,
    successful: ok.length,
    failed: fail.length,
    successRate: results.length ? (ok.length / results.length) * 100 : 0,
    throughput_flows_per_sec: throughput,
    e2e_ms: flowTimes.length
      ? {
          min: flowTimes[0],
          avg: flowTimes.reduce((a, b) => a + b, 0) / flowTimes.length,
          p50: percentile(flowTimes, 50),
          p95: percentile(flowTimes, 95),
          p99: percentile(flowTimes, 99),
          max: flowTimes[flowTimes.length - 1],
        }
      : null,
    place_accept_ms: placeTimes.length
      ? {
          avg: placeTimes.reduce((a, b) => a + b, 0) / placeTimes.length,
          p95: percentile(placeTimes, 95),
          max: placeTimes[placeTimes.length - 1],
        }
      : null,
    failure_samples: fail.slice(0, 12).map((f) => f.error),
  };
}

function project5M(load) {
  const tps = load.throughput_flows_per_sec || 0;
  const acceptP95 = load.place_accept_ms?.p95 || 0;
  const hoursAtCurrent = tps > 0 ? DESIGN_TARGET / tps / 3600 : null;
  // Rule of thumb: keep p95 accept under 500ms with headroom → scale replicas
  const targetAcceptTps = 50_000; // aspirational gateway+LB aggregate
  const gatewayReplicasNeeded = tps > 0 ? Math.ceil(targetAcceptTps / Math.max(tps, 1)) : 'n/a';
  return {
    design_target_orders: DESIGN_TARGET,
    measured_throughput_flows_per_sec: tps,
    hours_to_reach_target_at_measured_rate: hoursAtCurrent,
    note:
      '5M parallel accepts require horizontal scale (many gateway/order replicas + Kafka partitions + Postgres write capacity). Local single-node measures the accept path; Kafka/outbox absorbs async work.',
    recommended_architecture: {
      gateway_replicas_behind_lb: '50–200+ (stateless Nest)',
      order_service_replicas: '20–100 with partitioned outbox pollers',
      kafka_partitions_order_created: '64–256',
      notification_workers: 'scale consumers independently for email/SMS/push',
      postgres: 'primary + read replicas; partitioned orders; connection pooling (PgBouncer)',
      redis: 'cluster/sentinel for cart + rate-limit + catalog cache',
      docker_k8s: 'Helm charts under infra/helm; HPA on CPU/RPS',
    },
    rough_gateway_replicas_for_50k_accepts_per_sec_vs_measured: gatewayReplicasNeeded,
    measured_place_p95_ms: acceptP95,
  };
}

function toMarkdown(report) {
  const L = [];
  L.push(`# Food Order App — High Concurrency Full Report`);
  L.push('');
  L.push(`Generated: **${report.generated_at}**`);
  L.push('');
  L.push(`| Setting | Value |`);
  L.push(`|---------|-------|`);
  L.push(`| Design target | ${report.design_target.toLocaleString()} orders |`);
  L.push(`| Actual TOTAL | ${report.config.TOTAL} |`);
  L.push(`| CONCURRENCY | ${report.config.CONCURRENCY} |`);
  L.push(`| API_BASE | ${report.config.API_BASE} |`);
  L.push(`| SKIP_LOAD | ${report.config.SKIP_LOAD} |`);
  L.push('');
  L.push(`## 1. Service health`);
  L.push('');
  L.push('| Service | Port | OK | Status |');
  L.push('|---------|------|----|--------|');
  for (const [name, h] of Object.entries(report.after.services.health || {})) {
    L.push(`| ${name} | ${h.port} | ${h.ok ? 'yes' : 'no'} | ${h.status ?? h.error ?? ''} |`);
  }
  L.push('');
  L.push(`## 2. Docker (infra horizontal base)`);
  L.push('');
  for (const c of report.after.docker.containers || []) {
    L.push(`- **${c.name}**: ${c.status}`);
  }
  L.push('');
  L.push('Resource snapshot:');
  L.push('```');
  L.push((report.after.docker.resource_stats || []).map((r) => `${r.name} ${r.cpu} ${r.mem}`).join('\n') || 'n/a');
  L.push('```');
  L.push('');
  L.push(`> ${report.after.docker.horizontal_scaling_note}`);
  L.push('');
  L.push(`## 3. Load burst results`);
  L.push('');
  if (report.load.skipped) {
    L.push('_Load skipped (SKIP_LOAD or TOTAL=0)._');
  } else {
    L.push(`- Completed: **${report.load.completed}**`);
    L.push(`- Successful: **${report.load.successful}** (${report.load.successRate.toFixed(1)}%)`);
    L.push(`- Failed: **${report.load.failed}**`);
    L.push(`- Wall clock: **${report.load.wallMs.toFixed(0)} ms**`);
    L.push(`- Throughput: **${report.load.throughput_flows_per_sec.toFixed(2)} flows/s**`);
    if (report.load.e2e_ms) {
      const e = report.load.e2e_ms;
      L.push(
        `- E2E latency ms: min ${e.min.toFixed(0)} · avg ${e.avg.toFixed(0)} · p50 ${e.p50.toFixed(0)} · p95 ${e.p95.toFixed(0)} · p99 ${e.p99.toFixed(0)} · max ${e.max.toFixed(0)}`,
      );
    }
    if (report.load.place_accept_ms) {
      const p = report.load.place_accept_ms;
      L.push(
        `- POST /orders 202 accept ms: avg ${p.avg.toFixed(0)} · p95 ${p.p95.toFixed(0)} · max ${p.max.toFixed(0)}`,
      );
    }
    if (report.load.failure_samples?.length) {
      L.push('');
      L.push('Failure samples:');
      for (const f of report.load.failure_samples) L.push(`- ${f}`);
    }
  }
  L.push('');
  L.push(`## 4. Postgres deltas (orders / outbox / notifications)`);
  L.push('');
  L.push('| Metric | Before | After | Δ |');
  L.push('|--------|--------|-------|---|');
  for (const [k, v] of Object.entries(report.deltas.postgres || {})) {
    L.push(`| ${k} | ${v.before} | ${v.after} | ${v.delta} |`);
  }
  L.push('');
  L.push('Orders by status (after):');
  L.push('```json');
  L.push(JSON.stringify(report.after.postgres?.orders_by_status ?? {}, null, 2));
  L.push('```');
  L.push('');
  L.push('Notification delivery by status (after):');
  L.push('```json');
  L.push(JSON.stringify(report.after.postgres?.notification_delivery_by_status ?? {}, null, 2));
  L.push('```');
  L.push('');
  L.push(`## 5. Redis`);
  L.push('');
  L.push('```json');
  L.push(JSON.stringify(report.after.redis, null, 2));
  L.push('```');
  L.push('');
  L.push(`## 6. Kafka topics & offsets`);
  L.push('');
  L.push('Topics: ' + (report.after.kafka.topics || []).join(', '));
  L.push('');
  L.push('```json');
  L.push(JSON.stringify(report.after.kafka.offsets, null, 2));
  L.push('```');
  L.push('');
  L.push('Consumer groups: ' + (report.after.kafka.consumer_groups || []).join(', '));
  L.push('');
  L.push(`## 7. Projection toward ${DESIGN_TARGET.toLocaleString()} orders`);
  L.push('');
  L.push('```json');
  L.push(JSON.stringify(report.projection_5m, null, 2));
  L.push('```');
  L.push('');
  L.push(`## 8. Design notes (required architecture)`);
  L.push('');
  L.push('- Use message queues (Kafka) for order processing after HTTP 202.');
  L.push('- Use Node clustering or Docker/K8s horizontal scaling for gateway & order.');
  L.push('- Optimize DB with indexes, partitioning (orders/notifications already partitioned by month).');
  L.push('- Store long-running tasks (emailing, notifications) in background workers.');
  L.push('');
  L.push('## Doc references');
  L.push('');
  L.push('- docs/HIGH-CONCURRENCY.md');
  L.push('- docs/LOAD-TESTING.md');
  L.push('- docs/API.md · Swagger http://localhost:3001/api/docs');
  L.push('- infra/docker/README.md · infra/helm/README.md');
  L.push('');
  return L.join('\n');
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toHtml(report) {
  const healthRows = Object.entries(report.after.services.health || {})
    .map(
      ([name, h]) =>
        `<tr><td>${esc(name)}</td><td>${esc(h.port)}</td><td class="${h.ok ? 'ok' : 'bad'}">${h.ok ? 'yes' : 'no'}</td><td>${esc(h.status ?? h.error ?? '')}</td></tr>`,
    )
    .join('');
  const dockerLis = (report.after.docker.containers || [])
    .map((c) => `<li><strong>${esc(c.name)}</strong> — ${esc(c.status)}</li>`)
    .join('');
  const statsPre = esc(
    (report.after.docker.resource_stats || []).map((r) => `${r.name} ${r.cpu} ${r.mem}`).join('\n') || 'n/a',
  );
  const deltaRows = Object.entries(report.deltas.postgres || {})
    .map(
      ([k, v]) =>
        `<tr><td>${esc(k)}</td><td>${v.before}</td><td>${v.after}</td><td class="${v.delta > 0 ? 'ok' : ''}">${v.delta}</td></tr>`,
    )
    .join('');

  let loadHtml = '<p><em>Load skipped.</em></p>';
  if (!report.load.skipped) {
    const e = report.load.e2e_ms;
    const p = report.load.place_accept_ms;
    loadHtml = `
      <div class="cards">
        <div class="card"><div class="label">Completed</div><div class="value">${report.load.completed}</div></div>
        <div class="card"><div class="label">Success</div><div class="value ok">${report.load.successful} (${report.load.successRate.toFixed(1)}%)</div></div>
        <div class="card"><div class="label">Failed</div><div class="value ${report.load.failed ? 'bad' : 'ok'}">${report.load.failed}</div></div>
        <div class="card"><div class="label">Throughput</div><div class="value">${report.load.throughput_flows_per_sec.toFixed(2)} /s</div></div>
        <div class="card"><div class="label">Wall clock</div><div class="value">${report.load.wallMs.toFixed(0)} ms</div></div>
      </div>
      ${
        e
          ? `<p><strong>E2E latency (ms):</strong> min ${e.min.toFixed(0)} · avg ${e.avg.toFixed(0)} · p50 ${e.p50.toFixed(0)} · p95 ${e.p95.toFixed(0)} · p99 ${e.p99.toFixed(0)} · max ${e.max.toFixed(0)}</p>`
          : ''
      }
      ${
        p
          ? `<p><strong>POST /orders 202 accept (ms):</strong> avg ${p.avg.toFixed(0)} · p95 ${p.p95.toFixed(0)} · max ${p.max.toFixed(0)}</p>`
          : ''
      }
      ${
        report.load.failure_samples?.length
          ? `<h3>Failure samples</h3><ul>${report.load.failure_samples.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>`
          : ''
      }
    `;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Food Order App — High Concurrency Report</title>
  <style>
    :root { --ink:#0b1610; --muted:#5c665f; --line:#d8d0c6; --paper:#f7f4ef; --ok:#1b7f4a; --bad:#b42318; --ember:#d9480f; }
    * { box-sizing: border-box; }
    body { margin:0; font-family: "IBM Plex Sans", "Segoe UI", system-ui, sans-serif; color:var(--ink); background:linear-gradient(180deg,#efe8df 0%, #f7f4ef 40%, #fff 100%); line-height:1.5; }
    header { background:linear-gradient(90deg,#0b1610,#14301f); color:#f7f4ef; padding:28px 24px; border-bottom:3px solid var(--ember); }
    header h1 { margin:0 0 6px; font-family: Georgia, "Times New Roman", serif; font-size:1.75rem; }
    header p { margin:0; opacity:.85; }
    main { max-width:980px; margin:0 auto; padding:24px 18px 64px; }
    section { background:#fff; border:1px solid var(--line); border-radius:2px; padding:18px 20px; margin:0 0 16px; }
    h2 { margin:0 0 12px; font-size:1.15rem; border-bottom:1px solid var(--line); padding-bottom:8px; }
    table { width:100%; border-collapse:collapse; font-size:.95rem; }
    th, td { text-align:left; padding:8px 10px; border-bottom:1px solid var(--line); vertical-align:top; }
    th { color:var(--muted); font-weight:600; background:var(--paper); }
    .ok { color:var(--ok); font-weight:600; }
    .bad { color:var(--bad); font-weight:600; }
    pre { background:var(--paper); border:1px solid var(--line); padding:12px; overflow:auto; font-size:.82rem; border-radius:2px; }
    .cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:10px; margin:12px 0; }
    .card { background:var(--paper); border:1px solid var(--line); padding:12px; border-radius:2px; }
    .card .label { font-size:.75rem; color:var(--muted); text-transform:uppercase; letter-spacing:.04em; }
    .card .value { font-size:1.25rem; font-weight:700; margin-top:4px; }
    .meta { display:grid; grid-template-columns:140px 1fr; gap:6px 12px; }
    .meta span { color:var(--muted); }
    ul { margin:8px 0; padding-left:18px; }
    footer { color:var(--muted); font-size:.85rem; margin-top:8px; }
    a { color:var(--ember); }
  </style>
</head>
<body>
  <header>
    <h1>Food Order App — High Concurrency Report</h1>
    <p>Design target ${esc(report.design_target.toLocaleString())} orders · Generated ${esc(report.generated_at)}</p>
  </header>
  <main>
    <section>
      <h2>Run configuration</h2>
      <div class="meta">
        <span>Design target</span><div>${esc(report.design_target.toLocaleString())}</div>
        <span>TOTAL</span><div>${esc(report.config.TOTAL)}</div>
        <span>CONCURRENCY</span><div>${esc(report.config.CONCURRENCY)}</div>
        <span>API_BASE</span><div>${esc(report.config.API_BASE)}</div>
        <span>SKIP_LOAD</span><div>${esc(report.config.SKIP_LOAD)}</div>
      </div>
    </section>

    <section>
      <h2>1. Service health</h2>
      <table><thead><tr><th>Service</th><th>Port</th><th>OK</th><th>Status</th></tr></thead><tbody>${healthRows}</tbody></table>
    </section>

    <section>
      <h2>2. Docker (infra)</h2>
      <ul>${dockerLis}</ul>
      <pre>${statsPre}</pre>
      <p>${esc(report.after.docker.horizontal_scaling_note)}</p>
    </section>

    <section>
      <h2>3. Load burst results</h2>
      ${loadHtml}
    </section>

    <section>
      <h2>4. Postgres deltas</h2>
      <table><thead><tr><th>Metric</th><th>Before</th><th>After</th><th>Δ</th></tr></thead><tbody>${deltaRows}</tbody></table>
      <h3>Orders by status</h3>
      <pre>${esc(JSON.stringify(report.after.postgres?.orders_by_status ?? {}, null, 2))}</pre>
      <h3>Notification delivery by status</h3>
      <pre>${esc(JSON.stringify(report.after.postgres?.notification_delivery_by_status ?? {}, null, 2))}</pre>
    </section>

    <section>
      <h2>5. Redis</h2>
      <pre>${esc(JSON.stringify(report.after.redis, null, 2))}</pre>
    </section>

    <section>
      <h2>6. Kafka topics &amp; offsets</h2>
      <p>Topics: ${esc((report.after.kafka.topics || []).join(', '))}</p>
      <pre>${esc(JSON.stringify(report.after.kafka.offsets, null, 2))}</pre>
      <p>Consumer groups: ${esc((report.after.kafka.consumer_groups || []).join(', '))}</p>
    </section>

    <section>
      <h2>7. Projection toward ${esc(DESIGN_TARGET.toLocaleString())} orders</h2>
      <pre>${esc(JSON.stringify(report.projection_5m, null, 2))}</pre>
    </section>

    <section>
      <h2>8. Design notes</h2>
      <ul>
        <li>Use message queues (Kafka) for order processing after HTTP 202.</li>
        <li>Use Node clustering or Docker/K8s horizontal scaling for gateway &amp; order.</li>
        <li>Optimize DB with indexes and partitioned orders/notifications.</li>
        <li>Store long-running tasks (emailing, notifications) in background workers.</li>
      </ul>
      <footer>
        Docs: <a href="../../docs/HIGH-CONCURRENCY.md">HIGH-CONCURRENCY.md</a> ·
        <a href="../../docs/LOAD-TESTING.md">LOAD-TESTING.md</a> ·
        <a href="http://localhost:3001/api/docs">Swagger</a>
      </footer>
    </section>
  </main>
</body>
</html>`;
}

async function main() {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Food Order App — High Concurrency Full Infra Report         ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log(`  DESIGN_TARGET  ${DESIGN_TARGET.toLocaleString()}`);
  console.log(`  CONCURRENCY    ${CONCURRENCY}`);
  console.log(`  TOTAL          ${TOTAL}${SKIP_LOAD ? ' (load skipped)' : ''}`);
  console.log(`  API_BASE       ${API_BASE}`);
  console.log('');

  if (!dockerOk()) {
    console.error('Docker is required for the full report (Postgres/Redis/Kafka containers).');
    process.exit(1);
  }

  try {
    await api('/catalog/products?limit=1');
  } catch (err) {
    console.error('Gateway not reachable. Start stack (gateway must be up with LOAD_TEST_BYPASS=true for large TOTAL).');
    console.error(err.message);
    process.exit(1);
  }

  console.log('→ Pre-snapshot: Docker / Postgres / Redis / Kafka / services…');
  const before = {
    docker: snapshotDocker(),
    postgres: snapshotPostgres(),
    redis: snapshotRedis(),
    kafka: snapshotKafka(),
    services: await snapshotServices(),
  };

  console.log('→ Running concurrent order flows…');
  const load = await runLoad();

  if (!SKIP_LOAD && SETTLE_MS > 0) {
    console.log(`→ Settling ${SETTLE_MS}ms for Kafka / notification workers…`);
    await new Promise((r) => setTimeout(r, SETTLE_MS));
  }

  console.log('→ Post-snapshot…');
  const after = {
    docker: snapshotDocker(),
    postgres: snapshotPostgres(),
    redis: snapshotRedis(),
    kafka: snapshotKafka(),
    services: await snapshotServices(),
  };

  const deltas = {
    postgres: diffNumeric(before.postgres, after.postgres, [
      'orders_total',
      'order_items',
      'order_outbox_total',
      'order_outbox_unpublished',
      'order_idempotency',
      'order_status_history',
      'users',
      'sessions',
      'notifications',
      'notification_delivery',
      'carts',
    ]),
  };

  const report = {
    generated_at: new Date().toISOString(),
    design_target: DESIGN_TARGET,
    config: { API_BASE, CONCURRENCY, TOTAL, SETTLE_MS, SKIP_LOAD, PAYMENT_TYPE },
    before,
    after,
    deltas,
    load,
    projection_5m: project5M(load),
  };

  mkdirSync(REPORT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonPath = join(REPORT_DIR, `high-concurrency-${stamp}.json`);
  const mdPath = join(REPORT_DIR, `high-concurrency-${stamp}.md`);
  const htmlPath = join(REPORT_DIR, `high-concurrency-${stamp}.html`);
  const latestJson = join(REPORT_DIR, 'latest.json');
  const latestMd = join(REPORT_DIR, 'latest.md');
  const latestHtml = join(REPORT_DIR, 'latest.html');
  const md = toMarkdown(report);
  const html = toHtml(report);
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  writeFileSync(mdPath, md);
  writeFileSync(htmlPath, html);
  writeFileSync(latestJson, JSON.stringify(report, null, 2));
  writeFileSync(latestMd, md);
  writeFileSync(latestHtml, html);

  console.log('');
  console.log(md);
  console.log('');
  console.log(`Report written:`);
  console.log(`  ${htmlPath}`);
  console.log(`  ${latestHtml}`);
  console.log(`  ${mdPath}`);
  console.log(`  ${jsonPath}`);
  console.log('');

  if (!load.skipped && load.failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
