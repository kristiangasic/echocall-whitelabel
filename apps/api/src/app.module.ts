import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ConfigModule } from './config/config.module.js';
import { AccountModule } from './account/account.module.js';
import { AdminCustomersModule } from './admin/customers/admin-customers.module.js';
import { AdminHubProxyModule } from './admin/hub/admin-hub-proxy.module.js';
import { ImpersonationModule } from './admin/impersonation/impersonation.module.js';
import { AdminOverviewModule } from './admin/overview/admin-overview.module.js';
import { AdminUsersModule } from './admin/users/admin-users.module.js';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { type AppConfig, APP_CONFIG } from './config/env.js';
import { cacheControlFor } from './common/static-cache.js';
import { DbModule } from './db/db.module.js';
import { EchoCallModule } from './echocall/echocall.module.js';
import { EmbedModule } from './embed/embed.module.js';
import { HealthModule } from './health/health.module.js';
import { HubProxyModule } from './hub-proxy/hub-proxy.module.js';
import { MailModule } from './mail/mail.module.js';
import { RegistrationModule } from './registration/registration.module.js';
import { TwoFactorModule } from './auth/two-factor.module.js';
import { SettingsModule } from './settings/settings.module.js';
import { SetupModule } from './setup/setup.module.js';

@Module({
  imports: [
    ConfigModule,
    DbModule,
    EchoCallModule,
    MailModule,
    AuditModule,
    AuthModule,
    TwoFactorModule,
    SettingsModule,
    SetupModule,
    AdminOverviewModule,
    AdminUsersModule,
    AdminCustomersModule,
    RegistrationModule,
    AdminHubProxyModule,
    ImpersonationModule,
    AccountModule,
    HubProxyModule,
    EmbedModule,
    HealthModule,
    // Serves the built Angular app next to the API when WEB_DIST_DIR points at it.
    ServeStaticModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        config.webDistDir
          ? [
              {
                rootPath: config.webDistDir,
                exclude: ['/api/{*path}', '/embed/{*path}', '/healthz', '/readyz'],
                serveStaticOptions: {
                  setHeaders: (res, path) => res.setHeader('Cache-Control', cacheControlFor(path)),
                },
              },
            ]
          : [],
    }),
  ],
})
export class AppModule {}
