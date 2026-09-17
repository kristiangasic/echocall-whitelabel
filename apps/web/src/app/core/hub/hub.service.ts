import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';
import { map } from 'rxjs';
import { ApiService } from '../api/api.service';

type Params = Record<string, string | number | boolean>;

/**
 * Calls the hub through the portal's allow-listed proxy under /api/hub.
 * Paths are the documented hub paths, for example get('/agents/3').
 */
@Injectable({ providedIn: 'root' })
export class HubService {
  private readonly api = inject(ApiService);

  get<T>(path: string, params?: Params): Observable<T> {
    return this.api.get<T>('/hub' + path, params);
  }

  /** Fetches a hub collection and unwraps its { data } envelope. */
  list<T>(path: string, params?: Params): Observable<T[]> {
    return this.get<{ data: T[] }>(path, params).pipe(map((res) => res.data));
  }

  post<T>(path: string, body: unknown = {}): Observable<T> {
    return this.api.post<T>('/hub' + path, body);
  }

  patch<T>(path: string, body: unknown = {}): Observable<T> {
    return this.api.patch<T>('/hub' + path, body);
  }

  delete<T = unknown>(path: string): Observable<T> {
    return this.api.delete<T>('/hub' + path);
  }
}
