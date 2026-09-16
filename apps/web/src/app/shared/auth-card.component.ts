import { Component, inject } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { BrandingService } from '../core/branding/branding.service';
import { FooterLinksComponent } from './footer-links.component';

/** Centered card with the operator's logo and name, used by the pages outside the shell. */
@Component({
  selector: 'app-auth-card',
  imports: [MatCardModule, FooterLinksComponent],
  template: `
    <div class="auth-wrap">
      <div class="auth-brand">
        @if (branding().logoDataUrl; as logo) {
          <img class="auth-logo" [src]="logo" alt="" />
        }
        <span class="auth-name">{{ branding().productName }}</span>
      </div>
      <mat-card appearance="outlined" class="auth-card">
        <mat-card-content>
          <ng-content />
        </mat-card-content>
      </mat-card>
      <app-footer-links />
    </div>
  `,
  styles: `
    .auth-wrap {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px 16px;
      box-sizing: border-box;
      background: var(--mat-sys-surface-container-low);
    }
    .auth-brand {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      margin-bottom: 24px;
    }
    .auth-logo {
      max-height: 56px;
      max-width: 220px;
    }
    .auth-name {
      font: var(--mat-sys-title-large);
      color: var(--mat-sys-on-surface);
    }
    .auth-card {
      width: 100%;
      max-width: 440px;
    }
  `,
})
export class AuthCardComponent {
  readonly branding = inject(BrandingService).branding;
}
