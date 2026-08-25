import type { ServiceHealth } from '@clipgenius/types';
import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  getHealth(): ServiceHealth {
    return {
      service: 'clipgenius-api',
      status: 'ok',
    };
  }
}
