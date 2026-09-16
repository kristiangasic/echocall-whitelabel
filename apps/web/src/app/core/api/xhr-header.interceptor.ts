import type { HttpInterceptorFn } from '@angular/common/http';
import { API_BASE } from './api.service';

/** The API rejects state-changing requests without this header (CSRF protection). */
export const xhrHeaderInterceptor: HttpInterceptorFn = (req, next) =>
  req.url.startsWith(`${API_BASE}/`)
    ? next(req.clone({ setHeaders: { 'X-Requested-With': 'XMLHttpRequest' } }))
    : next(req);
