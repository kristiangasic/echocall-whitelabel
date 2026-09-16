import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';

export const API_BASE = '/api';

type Params = Record<string, string | number | boolean>;

function url(path: string): string {
  return API_BASE + path;
}

/** Thin wrapper around HttpClient for the portal's own API; paths are given without the /api prefix. */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  get<T>(path: string, params?: Params): Observable<T> {
    return this.http.get<T>(url(path), { params, withCredentials: true });
  }

  post<T>(path: string, body: unknown = {}): Observable<T> {
    return this.http.post<T>(url(path), body, { withCredentials: true });
  }

  patch<T>(path: string, body: unknown): Observable<T> {
    return this.http.patch<T>(url(path), body, { withCredentials: true });
  }

  put<T>(path: string, body: unknown): Observable<T> {
    return this.http.put<T>(url(path), body, { withCredentials: true });
  }

  delete<T>(path: string): Observable<T> {
    return this.http.delete<T>(url(path), { withCredentials: true });
  }
}
