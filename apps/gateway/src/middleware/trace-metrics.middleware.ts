import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import {
  context,
  propagation,
  trace,
  SpanStatusCode,
} from '@opentelemetry/api';
import { getBusinessMetrics, getActiveTraceId } from '@food-ordering/observability';

/**
 * Article V.1 — assign/propagate W3C Trace Context at the edge.
 *  Documentation §12 — latency / traffic / errors golden signals.
 */
@Injectable()
export class TraceMetricsMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const carrier: Record<string, string> = {};
    if (typeof req.headers.traceparent === 'string') {
      carrier.traceparent = req.headers.traceparent;
    }
    if (typeof req.headers.tracestate === 'string') {
      carrier.tracestate = req.headers.tracestate;
    }
    const parent = propagation.extract(context.active(), carrier);
    const tracer = trace.getTracer(process.env.SERVICE_NAME ?? 'gateway');
    const span = tracer.startSpan(
      `${req.method} ${req.path}`,
      undefined,
      parent,
    );

    const start = process.hrtime.bigint();
    context.with(trace.setSpan(parent, span), () => {
      const tid = getActiveTraceId();
      if (tid) {
        res.setHeader('x-trace-id', tid);
      }

      res.on('finish', () => {
        const elapsedNs = Number(process.hrtime.bigint() - start);
        const seconds = elapsedNs / 1e9;
        const route = req.route?.path ? String(req.route.path) : req.path;
        const metrics = getBusinessMetrics();
        const labels = {
          service: process.env.SERVICE_NAME ?? 'gateway',
          method: req.method,
          route,
          status: String(res.statusCode),
        };
        metrics.httpRequestDuration.observe(labels, seconds);
        metrics.httpRequestsTotal.inc(labels);
        if (res.statusCode >= 500) {
          span.setStatus({ code: SpanStatusCode.ERROR });
        } else {
          span.setStatus({ code: SpanStatusCode.OK });
        }
        span.end();
      });

      next();
    });
  }
}

/**  Documentation §11 — security headers at the public edge */
export function securityHeadersMiddleware(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; frame-ancestors 'none'",
  );
  next();
}
