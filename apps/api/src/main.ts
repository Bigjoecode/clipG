import { parseApiEnvironment } from '@clipgenius/config';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const environment = parseApiEnvironment(process.env);
  const application = await NestFactory.create(AppModule);

  application.enableCors({
    credentials: true,
    origin: environment.WEB_ORIGIN,
  });
  application.enableShutdownHooks();
  await application.listen(environment.API_PORT);
}

void bootstrap();
