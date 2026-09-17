import { Injectable } from '@angular/core';
import { HubApi } from './hub.service';

/**
 * The operator surface of the hub, for the admin panel: every call runs as the
 * portal operator rather than as a customer, and the allow-listed reseller
 * group of the hub API is all it reaches. Paths are the documented hub paths,
 * for example get('/resellers/stats').
 */
@Injectable({ providedIn: 'root' })
export class AdminHubService extends HubApi {
  protected readonly prefix = '/admin/hub';
}
