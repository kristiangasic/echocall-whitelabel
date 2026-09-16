import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../api/api.service';
import type { SetupStatus } from '../models';

/**
 * Sends visitors to /setup while no administrator exists and away from it afterwards.
 * When the status cannot be read the page itself shows the error.
 */
export const setupGuard: CanActivateFn = async (_route, state) => {
  const api = inject(ApiService);
  const router = inject(Router);
  const status = await firstValueFrom(api.get<SetupStatus>('/setup/status')).catch(() => null);
  if (!status) return true;
  const onSetup = state.url.startsWith('/setup');
  if (status.needsAdmin && !onSetup) return router.createUrlTree(['/setup']);
  if (!status.needsAdmin && onSetup) return router.createUrlTree(['/login']);
  return true;
};
