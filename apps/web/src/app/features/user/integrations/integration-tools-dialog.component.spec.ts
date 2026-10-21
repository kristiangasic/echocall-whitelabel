import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import type { CatalogTool } from '../../../core/hub/hub.models';
import { provideTestI18n, USER_TEXTS } from '../../../testing/i18n';
import {
  IntegrationToolsDialogComponent,
  type IntegrationToolsDialogData,
} from './integration-tools-dialog.component';

const TOOLS: { data: CatalogTool[]; recommended: string[] } = {
  data: [
    { name: 'list_slots', description: 'Freie Termine lesen.', access: 'read' },
    { name: 'book_appointment', description: 'Termin buchen.', access: 'write' },
    { name: 'cancel_appointment', description: 'Termin absagen.', access: 'delete' },
  ],
  recommended: ['list_slots', 'book_appointment'],
};

describe('IntegrationToolsDialogComponent', () => {
  let http: HttpTestingController;
  let closed: unknown;

  async function render(data: IntegrationToolsDialogData, answer = TOOLS) {
    closed = undefined;
    await TestBed.configureTestingModule({
      imports: [IntegrationToolsDialogComponent, provideTestI18n()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: { close: (value: unknown) => (closed = value) } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(IntegrationToolsDialogComponent);
    await fixture.whenStable();
    http.expectOne('/api/hub/integrations/4/tools').flush(answer);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    return fixture;
  }

  afterEach(() => http.verify());

  it('shows what a service can do and how far each action goes', async () => {
    const fixture = await render({ integrationId: 4, name: 'Termine' });

    const list = fixture.nativeElement.querySelector('[data-testid="integration-tools"]');
    expect(list.textContent).toContain('book_appointment');
    expect(list.textContent).toContain(USER_TEXTS.integrations.access.write);
    expect(list.textContent).toContain(USER_TEXTS.integrations.recommended);
  });

  it('offers no checkboxes when it was opened to look, not to choose', async () => {
    const fixture = await render({ integrationId: 4, name: 'Termine' });

    expect(fixture.nativeElement.querySelector('[data-testid="tool-list_slots"]')).toBeNull();
  });

  it('returns null for the recommended set', async () => {
    const fixture = await render({ integrationId: 4, name: 'Termine', selection: null });

    expect(fixture.componentInstance.useRecommended()).toBe(true);
    fixture.componentInstance.apply();

    expect(closed).toEqual({ enabledTools: null });
  });

  it('starts a custom selection from the recommended tools', async () => {
    const fixture = await render({ integrationId: 4, name: 'Termine', selection: null });

    fixture.componentInstance.setRecommended(false);

    expect(fixture.componentInstance.enabled()).toEqual(['list_slots', 'book_appointment']);
  });

  it('returns exactly the tools that were ticked', async () => {
    const fixture = await render({ integrationId: 4, name: 'Termine', selection: ['list_slots'] });

    fixture.componentInstance.toggle(TOOLS.data[2], true);
    fixture.componentInstance.apply();

    expect(closed).toEqual({ enabledTools: ['list_slots', 'cancel_appointment'] });
  });

  it('keeps a tool the permissions forbid switched off and out of the selection', async () => {
    const forbidden = {
      data: [TOOLS.data[0], { ...TOOLS.data[1], permitted: false }, TOOLS.data[2]],
      recommended: TOOLS.recommended,
    };
    const fixture = await render(
      { integrationId: 4, name: 'Termine', selection: ['list_slots', 'book_appointment'] },
      forbidden,
    );
    const component = fixture.componentInstance;

    const chip = fixture.nativeElement.querySelector('[data-testid="not-permitted-book_appointment"]');
    expect(chip.textContent.trim()).toBe(USER_TEXTS.integrations.notPermitted);
    const box: HTMLInputElement = fixture.nativeElement.querySelector(
      '[data-testid="tool-book_appointment"] input',
    );
    expect(box.disabled).toBe(true);
    expect(component.isEnabled(forbidden.data[1])).toBe(false);

    component.apply();
    expect(closed).toEqual({ enabledTools: ['list_slots'] });

    component.setRecommended(true);
    component.setRecommended(false);
    expect(component.enabled()).toEqual(['list_slots']);
  });
});
