import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { provideTestI18n, USER_TEXTS } from '../../../testing/i18n';
import { TicketsPage } from './tickets.page';

@Component({ template: '' })
class BlankPage {}

const TICKET = {
  id: 'ticket_5',
  subject: 'Rufnummer klingelt nicht',
  status: 'open',
  category: 'technical',
  priority: 'high',
  updatedAt: '2026-09-16T10:00:00.000Z',
};

describe('TicketsPage', () => {
  let http: HttpTestingController;
  let dialogResult: unknown;

  beforeEach(async () => {
    dialogResult = undefined;
    await TestBed.configureTestingModule({
      imports: [TicketsPage, provideTestI18n()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: 'app/tickets/:id', component: BlankPage }]),
        { provide: MatDialog, useValue: { open: () => ({ afterClosed: () => of(dialogResult) }) } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function render(tickets: Record<string, unknown>[] = [TICKET]) {
    const fixture = TestBed.createComponent(TicketsPage);
    await fixture.whenStable();
    http.expectOne((req) => req.url === '/api/hub/tickets').flush({ data: tickets });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    return fixture;
  }

  it('lists the requests with their translated status and priority', async () => {
    const fixture = await render();

    const row = fixture.nativeElement.querySelector('[data-testid="tickets-table"] tbody tr');
    expect(row.textContent).toContain('Rufnummer klingelt nicht');
    expect(row.textContent).toContain(USER_TEXTS.tickets.statuses.open);
    expect(row.textContent).toContain(USER_TEXTS.tickets.priorities.high);
  });

  it('shows the empty hint without requests', async () => {
    const fixture = await render([]);

    expect(fixture.nativeElement.textContent).toContain(USER_TEXTS.tickets.empty);
  });

  it('sends the status of the chosen filter', async () => {
    const fixture = await render();

    fixture.componentInstance.setFilter('open');
    const request = http.expectOne((req) => req.url === '/api/hub/tickets');
    expect(request.request.params.get('status')).toBe('open');
    request.flush({ data: [] });
  });

  it('opens the new request in its detail page', async () => {
    const fixture = await render();
    dialogResult = { id: 'ticket_9' };

    await fixture.componentInstance.create();

    expect(TestBed.inject(Router).url).toBe('/app/tickets/ticket_9');
  });
});
