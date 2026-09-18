import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../api/api.service';
import type { LoginResult, SessionUser, TwoFactorChallenge } from '../models';

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

  /**
   * The password step. An account with a second factor is not signed in yet
   * when this resolves: it answers with a challenge, and the session starts in
   * verifyTwoFactor.
   */
  async login(email: string, password: string): Promise<LoginResult> {
    const body = await firstValueFrom(
      this.api.post<SessionUser | TwoFactorChallenge>('/auth/login', { email, password }),
    );
    if ('challenge' in body) return { kind: 'challenge', challenge: body };
    this.user.set(body);
    return { kind: 'session', user: body };
  }

  /**
   * Asks the portal to mail a one-time sign-in link. It answers the same way
   * for an address it knows and one it does not, so nothing here says whether
   * an account exists.
   */
  async requestSignInLink(email: string): Promise<void> {
    await firstValueFrom(this.api.post<void>('/auth/sign-in-link', { email }));
  }

  /** Spends the token from a mailed link. A second factor still applies. */
  async consumeSignInLink(token: string): Promise<LoginResult> {
    const body = await firstValueFrom(
      this.api.post<SessionUser | TwoFactorChallenge>('/auth/sign-in-link/consume', { token }),
    );
    if ('challenge' in body) return { kind: 'challenge', challenge: body };
    this.user.set(body);
    return { kind: 'session', user: body };
  }

  /** The second step: the code from the app, or one of the recovery codes. */
  async verifyTwoFactor(challenge: string, code: string): Promise<SessionUser> {
    const user = await firstValueFrom(this.api.post<SessionUser>('/auth/2fa/verify', { challenge, code }));
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
