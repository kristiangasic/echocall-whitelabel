import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import type { Role } from '../models';
import { AuthStore } from './auth.store';

/** Start page of a role. */
export function homePath(role: Role | undefined): string {
  return role === 'admin' ? '/admin' : '/app';
}

/** Lets users of the given role through; others land on their own start page. */
export function roleGuard(role: Role): CanActivateFn {
  return () => {
    const user = inject(AuthStore).user();
    const router = inject(Router);
    if (user?.role === role) return true;
    return router.createUrlTree([user ? homePath(user.role) : '/login']);
  };
}
