import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';
import { AllExceptionsFilter } from './filters/all-exceptions.filter';
import { HttpExceptionFilter } from './filters/http-exception.filter';
import { LoggingInterceptor } from './interceptors/logging.interceptor';
import { getEnv } from './config/env.config';

function resolvePort(defaultPort: number): number {
  const portArg = process.argv.find((arg) => arg.startsWith('--port='));
  if (!portArg) {
    return defaultPort;
  }

  const port = Number(portArg.split('=')[1]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid --port value: ${portArg.split('=')[1]}`);
  }
  return port;
}

function resolveCorsOrigin(origin: string): boolean | string[] {
  if (origin.trim() === '*') {
    return true;
  }
  return origin
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'warn', 'error', 'debug'],
  });
  const env = getEnv();
  app.setGlobalPrefix('api');
  app.enableCors({ origin: resolveCorsOrigin(env.CORS_ORIGIN) });
  app.useGlobalFilters(new AllExceptionsFilter(), new HttpExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());
  const port = resolvePort(env.PORT);
  await app.listen(port);
  logger.log(`Application is running on: http://localhost:${port}/api`);
}

bootstrap();
