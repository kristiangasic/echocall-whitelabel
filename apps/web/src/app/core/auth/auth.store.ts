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

  setUser(user: SessionUser): void {
    this.user.set(user);
  }

  clear(): void {
    this.user.set(null);
  }
}
