import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthStore } from '../auth/auth.store';
import { readApiError } from '../errors/api-error';
import { NotifyService } from '../notify/notify.service';
import { API_BASE } from './api.service';

/** Requests whose 401 is part of the normal flow and must not send the user to the login page. */
const EXPECTED_401 = ['/auth/login', '/auth/2fa/verify', '/auth/me', '/auth/logout', '/setup/'].map(
  (p) => API_BASE + p,
);
const UPSTREAM_CODES = new Set(['upstream_unavailable', 'upstream_timeout']);

/** Ends the client session on 401 and tells the user when the service behind the API is unreachable. */
export const authErrorInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const auth = inject(AuthStore);
  const notify = inject(NotifyService);
  return next(req).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && req.url.startsWith(`${API_BASE}/`)) {
        if (error.status === 401 && !EXPECTED_401.some((prefix) => req.url.startsWith(prefix))) {
          auth.clear();
          void router.navigate(['/login'], { queryParams: { returnUrl: router.url } });
        } else if (UPSTREAM_CODES.has(readApiError(error).code)) {
          notify.apiError(error);
        }
      }
      return throwError(() => error);
    }),
  );
};
