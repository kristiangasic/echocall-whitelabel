import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import type { CatalogTool } from '../../../core/hub/hub.models';
import { NotifyService } from '../../../core/notify/notify.service';
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
  let notified: string[];

  async function render(
    data: IntegrationToolsDialogData,
    answer: object = TOOLS,
    status = 200,
    exists = true,
  ) {
    closed = 'open';
    notified = [];
    await TestBed.configureTestingModule({
      imports: [IntegrationToolsDialogComponent, provideTestI18n()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: { close: (value: unknown) => (closed = value) } },
        { provide: NotifyService, useValue: { apiError: () => notified.push('apiError') } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(IntegrationToolsDialogComponent);
    await fixture.whenStable();
    http
      .expectOne('/api/hub/integrations/4/tools')
      .flush(answer, status === 200 ? {} : { status, statusText: 'Error' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (status === 404) {
      // A 404 is read against the integration itself: gone, or a type without a catalog.
      const lookup = http.expectOne('/api/hub/integrations/4');
      if (exists) lookup.flush({ id: 4, type: 'calcom', name: 'Termine', isActive: true, config: '{}' });
      else lookup.flush({ error: { code: 'not_found' } }, { status: 404, statusText: 'Not Found' });
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
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

  it('says a service with a fixed set of actions has nothing to choose, without an error', async () => {
    const fixture = await render(
      { integrationId: 4, name: 'Termine', selection: null },
      { error: { code: 'not_found', message: 'This integration has no selectable tool catalog' } },
      404,
    );

    expect(notified).toEqual([]);
    const text = fixture.nativeElement.textContent;
    expect(text).toContain(USER_TEXTS.integrations.fixedTools);
    expect(text).not.toContain(USER_TEXTS.integrations.noTools);
    expect(fixture.nativeElement.querySelector('[data-testid="tools-recommended"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="tools-save"]')).toBeNull();
  });

  it('reports an integration that is gone and closes', async () => {
    await render(
      { integrationId: 4, name: 'Termine', selection: null },
      { error: { code: 'not_found', message: 'Integration not found' } },
      404,
      false,
    );

    expect(notified).toEqual(['apiError']);
    expect(closed).toBeUndefined();
  });

  it('still reports any other failure', async () => {
    await render({ integrationId: 4, name: 'Termine' }, { error: { code: 'internal_error' } }, 500);

    expect(notified).toEqual(['apiError']);
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
