import { createStructuredLog, runReadinessChecks } from './index';

describe('structured log (Article V.4)', () => {
  it('includes required fields', () => {
    const entry = createStructuredLog('gateway', 'info', 'hello', 'trace-1');
    expect(entry.service).toBe('gateway');
    expect(entry.level).toBe('info');
    expect(entry.message).toBe('hello');
    expect(entry.trace_id).toBe('trace-1');
    expect(entry.timestamp).toBeTruthy();
  });
});

describe('runReadinessChecks (Article V.2)', () => {
  it('returns down when a check fails', async () => {
    const result = await runReadinessChecks({
      postgres: async () => true,
      redis: async () => false,
    });
    expect(result.status).toBe('down');
    expect(result.checks?.redis).toBe('down');
  });
});
