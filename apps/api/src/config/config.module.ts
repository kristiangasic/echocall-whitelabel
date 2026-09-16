import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, loadEnv } from './env.js';

@Global()
@Module({
  providers: [{ provide: APP_CONFIG, useFactory: () => loadEnv(process.env) }],
  exports: [APP_CONFIG],
})
export class ConfigModule {}
