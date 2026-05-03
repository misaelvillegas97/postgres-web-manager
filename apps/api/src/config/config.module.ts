import { Global, Module } from '@nestjs/common';
import { validateEnv } from './env.config';

@Global()
@Module({})
export class ConfigModule {
  static forRoot() {
    validateEnv();
    return { module: ConfigModule };
  }
}
