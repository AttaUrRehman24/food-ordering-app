import {
  Controller,
  Get,
  Header,
  Inject,
  Optional,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  HEALTH_CHECKS,
  renderPrometheusMetrics,
  runReadinessChecks,
  type DependencyCheck,
  type HealthStatus,
} from '@food-ordering/observability';

/** Article V.2 + §12 metrics — Gateway */
@Controller()
export class HealthController {
  constructor(
    @Optional()
    @Inject(HEALTH_CHECKS)
    private readonly checks: Record<string, DependencyCheck> | null,
  ) {}

  @Get('health/live')
  live(): HealthStatus {
    return { status: 'ok' };
  }

  @Get('health/ready')
  async ready(): Promise<HealthStatus> {
    if (!this.checks) {
      return { status: 'ok', checks: { process: 'ok' } };
    }
    const result = await runReadinessChecks(this.checks);
    if (result.status === 'down') {
      throw new ServiceUnavailableException(result);
    }
    return result;
  }

  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async metrics(@Res() res: Response): Promise<void> {
    res.send(await renderPrometheusMetrics());
  }
}
