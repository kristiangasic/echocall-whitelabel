import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { provideTestI18n, USER_TEXTS } from '../../../testing/i18n';
import { CampaignsPage } from './campaigns.page';

@Component({ template: '' })
class BlankPage {}

const CAMPAIGN = {
  id: 7,
  name: 'Rueckrufaktion',
  status: 'running',
  totalRecipients: 10,
  successfulCalls: 4,
  failedCalls: 1,
  pendingCalls: 5,
  createdAt: '2026-09-16T10:00:00.000Z',
};

describe('CampaignsPage', () => {
  let http: HttpTestingController;
  let dialogResult: unknown;

  beforeEach(async () => {
    dialogResult = undefined;
    await TestBed.configureTestingModule({
      imports: [CampaignsPage, provideTestI18n()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: 'app/campaigns/:id', component: BlankPage }]),
        { provide: MatDialog, useValue: { open: () => ({ afterClosed: () => of(dialogResult) }) } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function render(campaigns: Record<string, unknown>[] = [CAMPAIGN]) {
    const fixture = TestBed.createComponent(CampaignsPage);
    await fixture.whenStable();
    const request = http.expectOne((req) => req.url === '/api/hub/batch-calling/campaigns');
    request.flush({ data: campaigns, pagination: { page: 1, perPage: 20, total: campaigns.length } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    return { fixture, request };
  }

  it('lists the campaigns with their translated status and progress', async () => {
    const { fixture } = await render();

    const row = fixture.nativeElement.querySelector('[data-testid="campaigns-table"] tbody tr');
    expect(row.textContent).toContain('Rueckrufaktion');
    expect(row.textContent).toContain(USER_TEXTS.campaigns.statuses.running);
    expect(row.textContent).toContain('5 / 10');
  });

  it('shows the empty hint without campaigns', async () => {
    const { fixture } = await render([]);

    expect(fixture.nativeElement.textContent).toContain(USER_TEXTS.campaigns.empty);
  });

  it('asks for the first page without a status filter', async () => {
    const { request } = await render();

    expect(request.request.params.get('page')).toBe('1');
    expect(request.request.params.has('status')).toBe(false);
  });

  it('sends the status of the chosen filter', async () => {
    const { fixture } = await render();

    fixture.componentInstance.setFilter('draft');
    const request = http.expectOne((req) => req.url === '/api/hub/batch-calling/campaigns');
    expect(request.request.params.get('status')).toBe('draft');
    request.flush({ data: [] });
  });

  it('opens the new campaign in its detail page', async () => {
    const { fixture } = await render();
    dialogResult = { id: 9 };

    await fixture.componentInstance.create();

    expect(TestBed.inject(Router).url).toBe('/app/campaigns/9');
  });

  it('stays on the list when the dialog was cancelled', async () => {
    const { fixture } = await render();

    await fixture.componentInstance.create();

    expect(TestBed.inject(Router).url).toBe('/');
  });
});
