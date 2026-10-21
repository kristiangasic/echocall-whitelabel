import { firstValueFrom } from 'rxjs';
import type { HubService } from '../../../core/hub/hub.service';

/**
 * The service answers 404 both for an integration that is gone and for one whose
 * type has nothing at the address asked for, such as tools to pick or permissions
 * to set. Reading the integration itself tells the two apart.
 */
export async function integrationExists(hub: HubService, integrationId: number): Promise<boolean> {
  try {
    await firstValueFrom(hub.get(`/integrations/${integrationId}`));
    return true;
  } catch {
    return false;
  }
}
