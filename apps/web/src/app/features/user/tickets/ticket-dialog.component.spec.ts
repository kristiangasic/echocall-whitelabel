import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { provideTestI18n } from '../../../testing/i18n';
import { TicketDialogComponent } from './ticket-dialog.component';

describe('TicketDialogComponent', () => {
  let http: HttpTestingController;
  let closed: unknown;

  beforeEach(async () => {
    closed = undefined;
    await TestBed.configureTestingModule({
      imports: [TicketDialogComponent, provideTestI18n()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MatDialogRef, useValue: { close: (value: unknown) => (closed = value) } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function render() {
    const fixture = TestBed.createComponent(TicketDialogComponent);
    await fixture.whenStable();
    return fixture;
  }

  it('refuses to save without a subject and a description', async () => {
    const fixture = await render();
    const component = fixture.componentInstance;

    expect(component.canSave()).toBe(false);

    component.subject.set('Rufnummer klingelt nicht');
    expect(component.canSave()).toBe(false);

    component.description.set('Seit gestern kommt kein Anruf an.');
    expect(component.canSave()).toBe(true);
  });

  it('opens the request with category and priority and reports its id', async () => {
    const fixture = await render();
    const component = fixture.componentInstance;
    component.subject.set('Rufnummer klingelt nicht');
    component.description.set('Seit gestern kommt kein Anruf an.');
    component.priority.set('urgent');

    const pending = component.save();
    const request = http.expectOne('/api/hub/tickets');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      subject: 'Rufnummer klingelt nicht',
      description: 'Seit gestern kommt kein Anruf an.',
      category: 'technical',
      priority: 'urgent',
    });
    request.flush({ id: 'ticket_9', message: 'created' });
    await pending;

    expect(closed).toEqual({ id: 'ticket_9' });
  });
});
