import { Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTabsModule } from '@angular/material/tabs';
import { TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api/api.service';
import { AuthStore } from '../../core/auth/auth.store';
import { readApiError } from '../../core/errors/api-error';
import { LANGUAGES, type SessionUser } from '../../core/models';
import { NotifyService } from '../../core/notify/notify.service';
import { applyServerErrors } from '../../shared/forms/server-errors';
import { BillingPanel } from './billing.panel';
import { TwoFactorPanel } from './two-factor.panel';

/** Profile and security of the signed-in person; available to both roles. */
@Component({
  selector: 'app-account-page',
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatTabsModule,
    TranslocoDirective,
    BillingPanel,
    TwoFactorPanel,
  ],
  template: `
    <ng-container *transloco="let t">
      <h1 class="page-title">{{ t('account.title') }}</h1>
      <mat-tab-group [mat-stretch-tabs]="false">
        <mat-tab [label]="t('account.tabs.profile')">
          <div class="cards">
            <mat-card appearance="outlined">
              <!-- The tab already says Profile; the card says whose. -->
              <mat-card-header>
                <mat-card-title>{{ user()?.email }}</mat-card-title>
              </mat-card-header>
              <mat-card-content>
                <form [formGroup]="profile" (ngSubmit)="saveProfile()" novalidate>
                  <div class="row">
                    <mat-form-field appearance="outline">
                      <mat-label>{{ t('fields.firstName') }}</mat-label>
                      <input matInput formControlName="firstName" autocomplete="given-name" />
                    </mat-form-field>
                    <mat-form-field appearance="outline">
                      <mat-label>{{ t('fields.lastName') }}</mat-label>
                      <input matInput formControlName="lastName" autocomplete="family-name" />
                    </mat-form-field>
                  </div>
                  <mat-form-field appearance="outline" class="full">
                    <mat-label>{{ t('fields.language') }}</mat-label>
                    <mat-select formControlName="language">
                      @for (lang of languages; track lang) {
                        <mat-option [value]="lang">{{ t('languages.' + lang) }}</mat-option>
                      }
                    </mat-select>
                  </mat-form-field>
                  <div class="form-actions">
                    <button mat-flat-button type="submit" [disabled]="savingProfile()">
                      {{ t('actions.save') }}
                    </button>
                  </div>
                </form>
              </mat-card-content>
            </mat-card>
          </div>
        </mat-tab>
        <mat-tab [label]="t('account.tabs.security')" data-testid="security-tab">
          <ng-template matTabContent>
            <div class="cards">
              <app-two-factor-panel />
            </div>
          </ng-template>
        </mat-tab>
        @if (showBilling()) {
          <mat-tab [label]="t('account.tabs.billing')" data-testid="billing-tab">
            <ng-template matTabContent>
              <app-billing-panel />
            </ng-template>
          </mat-tab>
        }
      </mat-tab-group>
    </ng-container>
  `,
  styles: `
    mat-tab-group {
      margin-top: 8px;
    }
    .cards {
      padding-top: 24px;
      display: grid;
      gap: 24px;
      max-width: 720px;
      align-items: start;
    }
    mat-card-content {
      padding-top: 16px;
    }
    /* The header carries a single line and no subtitle under it, so the room
       a subtitle would have taken has to come from somewhere. */
    mat-card-header {
      padding-bottom: 8px;
    }
  `,
})
export class AccountPage {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthStore);
  private readonly notify = inject(NotifyService);
  private readonly fb = inject(NonNullableFormBuilder);
  readonly languages = LANGUAGES;
  readonly user = this.auth.user;

  /** Billing belongs to the hub customer, which an operator account does not have. */
  readonly showBilling = computed(() => this.user()?.echocallCustomerId !== null);

  readonly profile = this.fb.group({
    firstName: [this.user()?.firstName ?? '', Validators.maxLength(100)],
    lastName: [this.user()?.lastName ?? '', Validators.maxLength(100)],
    language: [this.user()?.language ?? 'en'],
  });
  readonly savingProfile = signal(false);

  async saveProfile(): Promise<void> {
    if (this.profile.invalid) return;
    this.savingProfile.set(true);
    try {
      const { firstName, lastName, language } = this.profile.getRawValue();
      const user = await firstValueFrom(
        this.api.patch<SessionUser>('/account/profile', {
          firstName: firstName || null,
          lastName: lastName || null,
          language,
        }),
      );
      this.auth.setUser(user);
      this.notify.success('account.profile.saved');
    } catch (err) {
      if (!applyServerErrors(this.profile, readApiError(err))) this.notify.apiError(err);
    } finally {
      this.savingProfile.set(false);
    }
  }
}
