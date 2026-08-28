import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const application = await NestFactory.createApplicationContext(AppModule);
  application.enableShutdownHooks();
  new Logger('Worker').log('ClipGenius media worker is listening for jobs.');
}

void bootstrap();
