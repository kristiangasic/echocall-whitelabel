import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { byTestId } from '../../../testing/dom';
import { provideTestI18n } from '../../../testing/i18n';
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

  async function render() {
    const fixture = TestBed.createComponent(AdminSettingsPage);
    await fixture.whenStable();
    http.expectOne('/api/admin/settings/smtp').flush(SMTP);
    await settle();
    fixture.detectChanges();
    return fixture;
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
});
