import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideTestI18n } from '../../../testing/i18n';
import { WebhookDialogComponent, type WebhookDialogData } from './webhook-dialog.component';

const EVENTS = {
  data: [
    { event: 'call.ended', description: 'Ein Anruf wurde beendet.' },
    { event: 'ticket.created', description: 'Ein Ticket wurde angelegt.' },
  ],
  wildcard: '*',
};

describe('WebhookDialogComponent', () => {
  let http: HttpTestingController;
  let closed: unknown;

  async function render(data: WebhookDialogData) {
    closed = undefined;
    await TestBed.configureTestingModule({
      imports: [WebhookDialogComponent, provideTestI18n()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: { close: (value: unknown) => (closed = value) } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(WebhookDialogComponent);
    await fixture.whenStable();
    http.expectOne('/api/hub/webhooks/events').flush(EVENTS);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    return fixture;
  }

  afterEach(() => http.verify());

  it('lists every subscribable event', async () => {
    const fixture = await render({});

    expect(fixture.nativeElement.querySelector('[data-testid="webhook-event-call.ended"]')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Ein Ticket wurde angelegt.');
  });

  it('returns the signing secret of a new endpoint', async () => {
    const fixture = await render({});
    const component = fixture.componentInstance;
    component.url.set('https://example.com/hooks/echo');
    component.toggle('call.ended', true);

    const pending = component.save();
    const request = http.expectOne('/api/hub/webhooks');
    expect(request.request.body).toEqual({
      url: 'https://example.com/hooks/echo',
      events: ['call.ended'],
    });
    request.flush({ id: 5, secret: 'b'.repeat(64), message: 'created' });
    await pending;

    expect(closed).toEqual({ created: true, secret: 'b'.repeat(64) });
  });

  it('subscribes to everything through the wildcard the service names', async () => {
    const fixture = await render({});
    const component = fixture.componentInstance;
    component.url.set('https://example.com/hooks/echo');
    component.setAll(true);

    const pending = component.save();
    const request = http.expectOne('/api/hub/webhooks');
    expect(request.request.body.events).toEqual(['*']);
    request.flush({ id: 5, secret: 'c'.repeat(64), message: 'created' });
    await pending;
  });

  it('reads the stored subscription of an existing endpoint', async () => {
    const fixture = await render({
      webhook: {
        id: 3,
        url: 'https://example.com/hooks/echo',
        events: '["call.ended","ticket.created"]',
        isActive: false,
        failedDeliveries: 0,
      },
    });

    expect(fixture.componentInstance.url()).toBe('https://example.com/hooks/echo');
    expect(fixture.componentInstance.active).toBe(false);
    expect(fixture.componentInstance.isSelected('ticket.created')).toBe(true);

    const pending = fixture.componentInstance.save();
    const request = http.expectOne('/api/hub/webhooks/3');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({
      url: 'https://example.com/hooks/echo',
      events: ['call.ended', 'ticket.created'],
      isActive: false,
    });
    request.flush({ message: 'updated' });
    await pending;

    expect(closed).toEqual({ created: false });
  });

  it('refuses to save without an event', async () => {
    const fixture = await render({});
    fixture.componentInstance.url.set('https://example.com/hooks/echo');

    expect(fixture.componentInstance.canSave()).toBe(false);
  });
});
