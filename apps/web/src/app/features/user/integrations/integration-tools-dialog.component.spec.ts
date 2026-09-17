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

  async function render(data: IntegrationToolsDialogData) {
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
    http.expectOne('/api/hub/integrations/4/tools').flush(TOOLS);
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
});
