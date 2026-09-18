import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';
import { map } from 'rxjs';
import { ApiService } from '../api/api.service';
import type { Pagination } from './hub.models';

type Params = Record<string, string | number | boolean>;

/** A hub collection that reports how many items there are in total. */
export interface HubPage<T> {
  data: T[];
  pagination?: Pagination;
}

/**
 * How a collection can arrive. Which of the two shapes the hub sends depends on
 * the endpoint and on the release the hub runs: customers, tickets and plans
 * still answer as a bare array, everything else wraps its items in { data }.
 */
type Collection<T> = HubPage<T> | T[] | null;

function toPage<T>(body: Collection<T>): HubPage<T> {
  if (Array.isArray(body)) return { data: body };
  return { data: body?.data ?? [], ...(body?.pagination ? { pagination: body.pagination } : {}) };
}

function toItems<T>(body: Collection<T>): T[] {
  return toPage(body).data;
}

/**
 * Calls the hub through one of the portal's allow-listed proxies.
 * Paths are the documented hub paths, for example get('/agents/3').
 */
export abstract class HubApi {
  protected readonly api = inject(ApiService);

  /** The portal route the proxy sits on, without the /api prefix. */
  protected abstract readonly prefix: string;

  get<T>(path: string, params?: Params): Observable<T> {
    return this.api.get<T>(this.prefix + path, params);
  }

  /** Fetches a hub collection and unwraps its { data } envelope. */
  list<T>(path: string, params?: Params): Observable<T[]> {
    return this.get<Collection<T>>(path, params).pipe(map(toItems));
  }

  /** Fetches one page of a paginated hub collection, envelope included. */
  page<T>(path: string, params?: Params): Observable<HubPage<T>> {
    return this.get<Collection<T>>(path, params).pipe(map(toPage));
  }

  post<T>(path: string, body: unknown = {}): Observable<T> {
    return this.api.post<T>(this.prefix + path, body);
  }

  patch<T>(path: string, body: unknown = {}): Observable<T> {
    return this.api.patch<T>(this.prefix + path, body);
  }

  delete<T = unknown>(path: string): Observable<T> {
    return this.api.delete<T>(this.prefix + path);
  }
}

/** The customer surface: every call runs in the signed-in customer's context. */
@Injectable({ providedIn: 'root' })
export class HubService extends HubApi {
  protected readonly prefix = '/hub';
}
