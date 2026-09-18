import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { BrandingService } from '../../../core/branding/branding.service';
import { byTestId } from '../../../testing/dom';
import { ADMIN_TEXTS, provideTestI18n, TEXTS } from '../../../testing/i18n';
import { AdminSettingsPage } from './admin-settings.page';

const SMTP = {
  source: 'settings',
  configured: true,
  host: 'mail.example.com',
  port: 587,
  secure: false,
  user: 'portal',
  hasPassword: true,
  from: 'portal@example.com',
};

const REGISTRATION = { selfServiceEnabled: false, mailReady: true };

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('AdminSettingsPage', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminSettingsPage, provideTestI18n()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function render(registration = REGISTRATION) {
    const fixture = TestBed.createComponent(AdminSettingsPage);
    await fixture.whenStable();
    http.expectOne('/api/admin/settings/smtp').flush(SMTP);
    http.expectOne('/api/admin/settings/registration').flush(registration);
    await settle();
    fixture.detectChanges();
    return fixture;
  }

  /** Opens one of the tabs by its position in the group. */
  async function openTab(fixture: Awaited<ReturnType<typeof render>>, index: number) {
    const tabs = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.mat-mdc-tab');
    tabs[index].click();
    await settle();
    fixture.detectChanges();
  }

  it('keeps the colour picker and the hex field showing the same colour', async () => {
    const fixture = await render();
    const picker = fixture.nativeElement.querySelector('input[type="color"]') as HTMLInputElement;
    const hex = byTestId<HTMLInputElement>(fixture, 'primary-color');

    picker.value = '#b45309';
    picker.dispatchEvent(new Event('input', { bubbles: true }));
    picker.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    fixture.detectChanges();

    expect(hex.value).toBe('#b45309');

    hex.value = '#0f766e';
    hex.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    fixture.detectChanges();

    expect(picker.value).toBe('#0f766e');
  });

  it('asks for a bare sender address, because the portal supplies the display name', async () => {
    const fixture = await render();
    await openTab(fixture, 1);

    const sender = byTestId<HTMLInputElement>(fixture, 'smtp-from');
    // The placeholder may only show what the form accepts.
    expect(sender.placeholder).not.toContain('<');

    sender.value = 'Portal <portal@example.com>';
    sender.dispatchEvent(new Event('input', { bubbles: true }));
    sender.dispatchEvent(new Event('blur', { bubbles: true }));
    await settle();
    fixture.detectChanges();

    byTestId(fixture, 'save-smtp').click();
    await settle();
    // Nothing is sent, so the operator is told in their own language instead of
    // reading the server's English complaint.
    http.expectNone('/api/admin/settings/smtp');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(TEXTS.validation.email);
  });

  it('opens the portal to sign-ups, and the sign-in page follows at once', async () => {
    const fixture = await render();
    await openTab(fixture, 2);

    byTestId(fixture, 'self-service').querySelector('button')?.click();
    await settle();
    byTestId(fixture, 'save-registration').click();
    await settle();

    const put = http.expectOne('/api/admin/settings/registration');
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ selfServiceEnabled: true });
    put.flush({ selfServiceEnabled: true, mailReady: true });
    await settle();

    // The sign-in page reads this from the branding service, not from a reload.
    expect(TestBed.inject(BrandingService).registration()).toEqual({ selfServiceEnabled: true });
  });

  it('says a mail server is needed before the switch can be used', async () => {
    const fixture = await render({ ...REGISTRATION, mailReady: false });
    await openTab(fixture, 2);

    expect(byTestId(fixture, 'registration-mail-required').textContent).toContain(
      ADMIN_TEXTS.settings.registration.mailRequired,
    );
  });
});
