/**
 * OpenTelemetry + structured logging ( Documentation §12, Article V).
 * Local exporters → OTel Collector → Jaeger / Prometheus / Loki (docker-compose).
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SEMRESATTRS_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import {
  context,
  propagation,
  trace,
  SpanStatusCode,
  type Span,
  type Context,
} from '@opentelemetry/api';
import {
  Counter,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from 'prom-client';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Article V.4 — every log line includes these fields at minimum */
export interface StructuredLog {
  timestamp: string;
  service: string;
  trace_id: string | null;
  level: LogLevel;
  message: string;
  [key: string]: unknown;
}

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'down';
  checks?: Record<string, 'ok' | 'down'>;
}

let sdk: NodeSDK | null = null;
let metricsRegistry: Registry | null = null;

export function createStructuredLog(
  service: string,
  level: LogLevel,
  message: string,
  traceId: string | null = null,
  extra: Record<string, unknown> = {},
): StructuredLog {
  return {
    timestamp: new Date().toISOString(),
    service,
    trace_id: traceId ?? getActiveTraceId(),
    level,
    message,
    ...extra,
  };
}

export function logJson(entry: StructuredLog): void {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(entry));
}

/** Article V.1 — current W3C trace id from active span context */
export function getActiveTraceId(): string | null {
  const span = trace.getActiveSpan();
  const id = span?.spanContext().traceId;
  return id && id !== '00000000000000000000000000000000' ? id : null;
}

export function injectTraceHeaders(
  carrier: Record<string, string> = {},
): Record<string, string> {
  propagation.inject(context.active(), carrier);
  return carrier;
}

export function extractTraceContext(carrier: Record<string, string | undefined>): Context {
  return propagation.extract(context.active(), carrier);
}

/** Kafka header propagation (Article V.1) */
export function kafkaTraceHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  injectTraceHeaders(headers);
  const tid = getActiveTraceId();
  if (tid) {
    headers['trace_id'] = tid;
  }
  return headers;
}

export function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T> | T,
): Promise<T> {
  const tracer = trace.getTracer(process.env.SERVICE_NAME ?? 'food-ordering');
  return tracer.startActiveSpan(name, async (span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err instanceof Error ? err.message : String(err),
      });
      throw err;
    } finally {
      span.end();
    }
  });
}

/**
 *  Documentation §12 — init OTel SDK once per process.
 * OTEL_EXPORTER_OTLP_ENDPOINT defaults to local collector.
 */
export function initTelemetry(serviceName: string): void {
  if (sdk || process.env.OTEL_SDK_DISABLED === 'true') {
    return;
  }
  const endpoint =
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318';
  sdk = new NodeSDK({
    resource: new Resource({
      [SEMRESATTRS_SERVICE_NAME]: serviceName,
    }),
    traceExporter: new OTLPTraceExporter({
      url: `${endpoint}/v1/traces`,
    }),
    instrumentations: [new HttpInstrumentation()],
  });
  sdk.start();
  logJson(
    createStructuredLog(serviceName, 'info', 'OpenTelemetry SDK started', null, {
      otlp: endpoint,
    }),
  );
}

export async function shutdownTelemetry(): Promise<void> {
  await sdk?.shutdown();
  sdk = null;
}

/**  Documentation §12 golden signals + business metrics → Prometheus scrape */
export function getMetricsRegistry(): Registry {
  if (!metricsRegistry) {
    metricsRegistry = new Registry();
    collectDefaultMetrics({ register: metricsRegistry });
  }
  return metricsRegistry;
}

export type BusinessMetrics = {
  httpRequestDuration: Histogram<string>;
  httpRequestsTotal: Counter<string>;
  orderAcceptTotal: Counter<string>;
  orderFinalizeLagSeconds: Histogram<string>;
  otpDeliveryLatencySeconds: Histogram<string>;
  kafkaConsumerLag: Counter<string>;
  cacheHits: Counter<string>;
  cacheMisses: Counter<string>;
  dlqMessages: Counter<string>;
};

let businessMetrics: BusinessMetrics | null = null;

export function getBusinessMetrics(): BusinessMetrics {
  if (businessMetrics) {
    return businessMetrics;
  }
  const register = getMetricsRegistry();
  businessMetrics = {
    httpRequestDuration: new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request latency',
      labelNames: ['service', 'method', 'route', 'status'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2],
      registers: [register],
    }),
    httpRequestsTotal: new Counter({
      name: 'http_requests_total',
      help: 'HTTP requests',
      labelNames: ['service', 'method', 'route', 'status'],
      registers: [register],
    }),
    orderAcceptTotal: new Counter({
      name: 'order_accept_total',
      help: 'Orders accepted (202)',
      labelNames: ['service', 'result'],
      registers: [register],
    }),
    orderFinalizeLagSeconds: new Histogram({
      name: 'order_finalize_lag_seconds',
      help: 'Lag from accept to terminal status',
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
      registers: [register],
    }),
    otpDeliveryLatencySeconds: new Histogram({
      name: 'otp_delivery_latency_seconds',
      help: 'OTP delivery latency',
      buckets: [0.05, 0.1, 0.25, 0.5, 1, 2],
      registers: [register],
    }),
    kafkaConsumerLag: new Counter({
      name: 'kafka_consumer_lag_observed_total',
      help: 'Observed consumer lag samples',
      labelNames: ['service', 'group'],
      registers: [register],
    }),
    cacheHits: new Counter({
      name: 'catalog_cache_hits_total',
      help: 'Catalog cache hits',
      registers: [register],
    }),
    cacheMisses: new Counter({
      name: 'catalog_cache_misses_total',
      help: 'Catalog cache misses',
      registers: [register],
    }),
    dlqMessages: new Counter({
      name: 'notification_dlq_messages_total',
      help: 'Messages sent to DLQ',
      labelNames: ['channel'],
      registers: [register],
    }),
  };
  return businessMetrics;
}

export async function renderPrometheusMetrics(): Promise<string> {
  return getMetricsRegistry().metrics();
}

export type DependencyCheck = () => Promise<boolean>;

/** Article V.2 — readiness aggregates dependency checks */
export async function runReadinessChecks(
  checks: Record<string, DependencyCheck>,
): Promise<HealthStatus> {
  const results: Record<string, 'ok' | 'down'> = {};
  let allOk = true;
  for (const [name, check] of Object.entries(checks)) {
    try {
      results[name] = (await check()) ? 'ok' : 'down';
    } catch {
      results[name] = 'down';
    }
    if (results[name] === 'down') {
      allOk = false;
    }
  }
  return {
    status: allOk ? 'ok' : 'down',
    checks: results,
  };
}

export { HEALTH_CHECKS } from './health.token';
