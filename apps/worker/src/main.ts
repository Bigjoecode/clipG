import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const application = await NestFactory.createApplicationContext(AppModule);
  application.enableShutdownHooks();
}

void bootstrap();
