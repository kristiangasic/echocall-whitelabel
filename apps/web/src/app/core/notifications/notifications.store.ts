import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { HubNotification } from '../hub/hub.models';
import { HubService } from '../hub/hub.service';

/** How many unread entries the bell menu shows before it links to the full page. */
const PREVIEW_SIZE = 5;

/**
 * Keeps the unread notification count the shell bell shows. The notifications
 * page and the bell share it, so marking something as read updates both.
 * A failed poll leaves the last known state alone instead of clearing the bell.
 */
@Injectable({ providedIn: 'root' })
export class NotificationsStore {
  private readonly hub = inject(HubService);

  readonly unread = signal(0);
  readonly preview = signal<HubNotification[]>([]);

  async refresh(): Promise<void> {
    try {
      const result = await firstValueFrom(
        this.hub.page<HubNotification>('/notifications', {
          unreadOnly: 'true',
          perPage: PREVIEW_SIZE,
        }),
      );
      this.preview.set(result.data);
      this.unread.set(result.pagination?.total ?? result.data.length);
    } catch {
      // A poll that fails keeps the previous count; the next tick tries again.
    }
  }

  async markRead(id: number): Promise<void> {
    await firstValueFrom(this.hub.patch(`/notifications/${id}/read`));
    await this.refresh();
  }

  async markAllRead(): Promise<void> {
    await firstValueFrom(this.hub.patch('/notifications/read-all'));
    await this.refresh();
  }
}
