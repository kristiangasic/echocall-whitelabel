import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { provideTestI18n, USER_TEXTS } from '../../../testing/i18n';
import { IntegrationsPage } from './integrations.page';

const INTEGRATION = {
  id: 4,
  name: 'Termine',
  type: 'calcom',
  isActive: true,
  lastUsedAt: '2026-09-16T10:00:00.000Z',
};

const TYPE = {
  type: 'calcom',
  name: 'Cal.com',
  description: 'Termine buchen und absagen.',
  category: 'calendar',
  requiresApiKey: true,
  configFields: [{ name: 'apiKey', label: 'API key', type: 'password', required: true }],
};

describe('IntegrationsPage', () => {
  let http: HttpTestingController;
  let opened: unknown[];
  let dialogResult: unknown;

  beforeEach(async () => {
    opened = [];
    dialogResult = undefined;
    await TestBed.configureTestingModule({
      imports: [IntegrationsPage, provideTestI18n()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: MatDialog,
          useValue: {
            open: (_component: unknown, config: unknown) => {
              opened.push(config);
              return { afterClosed: () => of(dialogResult) };
            },
          },
        },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function render(integrations: Record<string, unknown>[] = [INTEGRATION]) {
    const fixture = TestBed.createComponent(IntegrationsPage);
    await fixture.whenStable();
    http.expectOne('/api/hub/integrations').flush(integrations);
    http.expectOne('/api/hub/integrations/types').flush([TYPE]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    return fixture;
  }

  it('lists the connections with the catalog name of their service', async () => {
    const fixture = await render();

    const row = fixture.nativeElement.querySelector('[data-testid="integrations-table"] tbody tr');
    expect(row.textContent).toContain('Termine');
    expect(row.textContent).toContain('Cal.com');
    expect(row.textContent).toContain(USER_TEXTS.integrations.active);
  });

  it('shows the empty hint without connections', async () => {
    const fixture = await render([]);

    expect(fixture.nativeElement.textContent).toContain(USER_TEXTS.integrations.empty);
  });

  it('offers every catalog entry for connecting', async () => {
    const fixture = await render();

    const card = fixture.nativeElement.querySelector('[data-testid="integrations-catalog"]');
    expect(card.textContent).toContain('Cal.com');
    expect(card.textContent).toContain('Termine buchen und absagen.');
  });

  it('preselects the service when it is connected from the catalog', async () => {
    const fixture = await render();

    const pending = fixture.componentInstance.connect('calcom');
    await pending;

    expect(opened).toEqual([{ data: { types: [TYPE], type: 'calcom' } }]);
  });

  it('reloads after the dialog saved a connection', async () => {
    const fixture = await render();
    dialogResult = true;

    const pending = fixture.componentInstance.edit(fixture.componentInstance.integrations()[0]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    http.expectOne('/api/hub/integrations').flush([INTEGRATION]);
    http.expectOne('/api/hub/integrations/types').flush([TYPE]);
    await pending;

    expect(opened).toEqual([{ data: { types: [TYPE], integrationId: 4 } }]);
  });

  it('tests a connection and reports what the service answered', async () => {
    const fixture = await render();

    const pending = fixture.componentInstance.test(fixture.componentInstance.integrations()[0]);
    const request = http.expectOne('/api/hub/integrations/4/test');
    expect(request.request.method).toBe('POST');
    request.flush({ success: true, message: 'ok' });
    await pending;

    expect(fixture.componentInstance.busy()).toBe(false);
  });

  it('deletes a connection once it is confirmed', async () => {
    const fixture = await render();
    dialogResult = true;

    const pending = fixture.componentInstance.remove(fixture.componentInstance.integrations()[0]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const request = http.expectOne('/api/hub/integrations/4');
    expect(request.request.method).toBe('DELETE');
    request.flush({ success: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    http.expectOne('/api/hub/integrations').flush([]);
    http.expectOne('/api/hub/integrations/types').flush([TYPE]);
    await pending;

    expect(fixture.componentInstance.integrations()).toEqual([]);
  });

  it('keeps a connection when the confirmation is declined', async () => {
    const fixture = await render();
    dialogResult = false;

    await fixture.componentInstance.remove(fixture.componentInstance.integrations()[0]);

    expect(fixture.componentInstance.integrations().length).toBe(1);
  });
});
