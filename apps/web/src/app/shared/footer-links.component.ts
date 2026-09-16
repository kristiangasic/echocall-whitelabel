import { Component, inject } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { BrandingService } from '../core/branding/branding.service';

/** Imprint, privacy and support links from the branding; renders nothing when none is set. */
@Component({
  selector: 'app-footer-links',
  imports: [TranslocoDirective],
  template: `
    @if (branding().imprintUrl || branding().privacyUrl || branding().supportEmail) {
      <nav class="footer-links" *transloco="let t">
        @if (branding().imprintUrl; as url) {
          <a [href]="url" target="_blank" rel="noopener">{{ t('footer.imprint') }}</a>
        }
        @if (branding().privacyUrl; as url) {
          <a [href]="url" target="_blank" rel="noopener">{{ t('footer.privacy') }}</a>
        }
        @if (branding().supportEmail; as email) {
          <a [href]="'mailto:' + email">{{ t('footer.support') }}</a>
        }
      </nav>
    }
  `,
  styles: `
    .footer-links {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 16px;
      padding: 16px;
      font: var(--mat-sys-body-small);
    }
    a {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class FooterLinksComponent {
  readonly branding = inject(BrandingService).branding;
}
