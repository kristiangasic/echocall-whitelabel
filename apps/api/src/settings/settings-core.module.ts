import { Global, Module } from '@nestjs/common';
import { SettingsService } from './settings.service.js';

/**
 * The settings themselves, without the routes that manage them. Sign-in reads
 * them too, and a module that carries the admin controller would have to import
 * the auth module that the controller's guards come from.
 */
@Global()
@Module({
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsCoreModule {}
