import { Global, Module } from '@nestjs/common';
import { HubClientFactory } from './hub-client.factory.js';
import { HubStatusService } from './hub-status.service.js';

/**
 * Access to the hub behind the configured API key. HUB_FETCH is deliberately
 * not provided here: the factory falls back to the global fetch, and tests
 * supply a fake through the global test infrastructure module.
 */
@Global()
@Module({
  providers: [HubClientFactory, HubStatusService],
  exports: [HubClientFactory, HubStatusService],
})
export class EchoCallModule {}
