import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { LinkDialogComponent } from '../../../shared/link-dialog.component';
import { provideTestI18n, USER_TEXTS } from '../../../testing/i18n';
import { WebhookDialogComponent } from './webhook-dialog.component';
import { WebhooksPage } from './webhooks.page';

const WEBHOOK = {
  id: 3,
  url: 'https://example.com/hooks/echo',
  events: '["call.ended"]',
  isActive: true,
  failedDeliveries: 0,
  lastDeliveryAt: '2026-09-16T10:00:00.000Z',
  lastDeliveryStatus: 'success',
};

describe('WebhooksPage', () => {
  let http: HttpTestingController;
  let opened: unknown[];
  let dialogResult: unknown;

  beforeEach(async () => {
    opened = [];
    dialogResult = undefined;
    await TestBed.configureTestingModule({
      imports: [WebhooksPage, provideTestI18n()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: MatDialog,
          useValue: {
            open: (component: unknown) => {
              opened.push(component);
              return { afterClosed: () => of(dialogResult) };
            },
          },
        },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function render(webhooks: Record<string, unknown>[] = [WEBHOOK]) {
    const fixture = TestBed.createComponent(WebhooksPage);
    await fixture.whenStable();
    http.expectOne('/api/hub/webhooks').flush({ data: webhooks });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    return fixture;
  }

  it('lists the endpoints with their subscribed events', async () => {
    const fixture = await render();

    const row = fixture.nativeElement.querySelector('[data-testid="webhooks-table"] tbody tr');
    expect(row.textContent).toContain('https://example.com/hooks/echo');
    expect(row.textContent).toContain('call.ended');
    expect(row.textContent).toContain(USER_TEXTS.webhooks.active);
  });

  it('names the wildcard subscription instead of showing an asterisk', async () => {
    const fixture = await render([{ ...WEBHOOK, events: '["*"]' }]);

    const row = fixture.nativeElement.querySelector('[data-testid="webhooks-table"] tbody tr');
    expect(row.textContent).toContain(USER_TEXTS.webhooks.allEvents);
  });

  it('survives an endpoint whose event list cannot be read', async () => {
    const fixture = await render([{ ...WEBHOOK, events: 'not json' }]);

    expect(fixture.componentInstance.events(fixture.componentInstance.webhooks()[0])).toEqual([]);
  });

  it('shows the empty hint without endpoints', async () => {
    const fixture = await render([]);

    expect(fixture.nativeElement.textContent).toContain(USER_TEXTS.webhooks.empty);
  });

  it('shows the signing secret once after an endpoint was registered', async () => {
    const fixture = await render();
    dialogResult = { created: true, secret: 'a'.repeat(64) };

    const pending = fixture.componentInstance.create();
    await new Promise((resolve) => setTimeout(resolve, 0));
    http.expectOne('/api/hub/webhooks').flush({ data: [WEBHOOK] });
    await pending;

    expect(opened).toEqual([WebhookDialogComponent, LinkDialogComponent]);
  });

  it('sends a test delivery and refreshes the reported state', async () => {
    const fixture = await render();

    const pending = fixture.componentInstance.test(fixture.componentInstance.webhooks()[0]);
    const request = http.expectOne('/api/hub/webhooks/3/test');
    expect(request.request.method).toBe('POST');
    request.flush({ data: { delivered: true, status: 200 } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    http.expectOne('/api/hub/webhooks').flush({ data: [WEBHOOK] });
    await pending;

    expect(fixture.componentInstance.busy()).toBe(false);
  });

  it('deletes an endpoint once it is confirmed', async () => {
    const fixture = await render();
    dialogResult = true;

    const pending = fixture.componentInstance.remove(fixture.componentInstance.webhooks()[0]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const request = http.expectOne('/api/hub/webhooks/3');
    expect(request.request.method).toBe('DELETE');
    request.flush({ message: 'deleted' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    http.expectOne('/api/hub/webhooks').flush({ data: [] });
    await pending;

    expect(fixture.componentInstance.webhooks()).toEqual([]);
  });
});
