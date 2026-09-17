import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../api/api.service';
import type { SessionUser } from '../models';

/** The signed-in user, loaded once at start-up and kept in sync by the login, logout and profile calls. */
@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly api = inject(ApiService);

  readonly user = signal<SessionUser | null>(null);
  /** True once /auth/me has answered, whether or not a session exists. */
  readonly loaded = signal(false);
  readonly isAdmin = computed(() => this.user()?.role === 'admin');
  /** The operator behind this session while they are viewing the portal as a customer. */
  readonly impersonator = computed(() => this.user()?.impersonator ?? null);

  async load(): Promise<SessionUser | null> {
    try {
      this.user.set(await firstValueFrom(this.api.get<SessionUser>('/auth/me')));
    } catch {
      this.user.set(null);
    } finally {
      this.loaded.set(true);
    }
    return this.user();
  }

  async login(email: string, password: string): Promise<SessionUser> {
    const user = await firstValueFrom(this.api.post<SessionUser>('/auth/login', { email, password }));
    this.user.set(user);
    return user;
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.api.post<void>('/auth/logout'));
    } finally {
      this.user.set(null);
    }
  }

  /**
   * Opens the portal as one customer. The session cookie stays the same, so
   * every following request already runs in the customer's context.
   */
  async impersonate(customerId: number): Promise<SessionUser> {
    const user = await firstValueFrom(
      this.api.post<SessionUser>(`/admin/customers/${customerId}/impersonate`),
    );
    this.user.set(user);
    return user;
  }

  /** Hands the session back to the operator who opened it. */
  async stopImpersonation(): Promise<SessionUser> {
    const user = await firstValueFrom(this.api.post<SessionUser>('/auth/impersonation/stop'));
    this.user.set(user);
    return user;
  }

  setUser(user: SessionUser): void {
    this.user.set(user);
  }

  clear(): void {
    this.user.set(null);
  }
}
