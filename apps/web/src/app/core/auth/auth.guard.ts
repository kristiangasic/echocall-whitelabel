import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { AuthStore } from './auth.store';

/** Lets signed-in users through and sends everyone else to the login page, remembering where they wanted to go. */
export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthStore);
  const router = inject(Router);
  if (!auth.loaded()) await auth.load();
  if (auth.user()) return true;
  return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};
