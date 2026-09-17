import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { provideTestI18n, USER_TEXTS } from '../../../testing/i18n';
import { CampaignDetailPage } from './campaign-detail.page';

@Component({ template: '' })
class BlankPage {}

const RECIPIENT = {
  id: 1,
  phoneNumber: '+4930111',
  callStatus: 'completed',
  durationSeconds: 95,
  callStartedAt: '2026-09-16T10:00:00.000Z',
};

function campaign(status: string) {
  return {
    id: 7,
    name: 'Rueckrufaktion',
    status,
    totalRecipients: 10,
    successfulCalls: 4,
    failedCalls: 1,
    pendingCalls: 5,
    createdAt: '2026-09-16T10:00:00.000Z',
  };
}

describe('CampaignDetailPage', () => {
  let http: HttpTestingController;
  let dialogResult: unknown;

  beforeEach(async () => {
    dialogResult = undefined;
    await TestBed.configureTestingModule({
      imports: [CampaignDetailPage, provideTestI18n()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: 'app/campaigns', component: BlankPage }]),
        { provide: MatDialog, useValue: { open: () => ({ afterClosed: () => of(dialogResult) }) } },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: '7' }) } } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function render(status = 'draft', recipients: Record<string, unknown>[] = [RECIPIENT]) {
    const fixture = TestBed.createComponent(CampaignDetailPage);
    await fixture.whenStable();
    http.expectOne('/api/hub/batch-calling/campaigns/7').flush(campaign(status));
    await new Promise((resolve) => setTimeout(resolve, 0));
    http
      .expectOne((req) => req.url === '/api/hub/batch-calling/campaigns/7/recipients')
      .flush({ data: recipients, pagination: { page: 1, perPage: 50, total: recipients.length } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    return fixture;
  }

  it('shows the counters and the recipients with their call result', async () => {
    const fixture = await render('running');

    expect(fixture.nativeElement.querySelector('[data-testid="campaign-status"]').textContent).toContain(
      USER_TEXTS.campaigns.statuses.running,
    );
    const row = fixture.nativeElement.querySelector('[data-testid="recipients-table"] tbody tr');
    expect(row.textContent).toContain('+4930111');
    expect(row.textContent).toContain(USER_TEXTS.campaigns.callStatuses.completed);
    expect(row.textContent).toContain('1:35');
  });

  it('offers the start button only for a draft', async () => {
    const fixture = await render('draft');

    expect(fixture.nativeElement.querySelector('[data-testid="campaign-submit"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="campaign-cancel"]')).toBeNull();
  });

  it('offers the stop button while the campaign runs', async () => {
    const fixture = await render('running');

    expect(fixture.nativeElement.querySelector('[data-testid="campaign-submit"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="campaign-cancel"]')).not.toBeNull();
  });

  it('starts a campaign and reloads it', async () => {
    const fixture = await render('draft');

    const pending = fixture.componentInstance.submit();
    const request = http.expectOne('/api/hub/batch-calling/campaigns/7/submit');
    expect(request.request.method).toBe('POST');
    request.flush({ id: 7, batchId: 'batch_1', status: 'pending', message: 'started' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    http.expectOne('/api/hub/batch-calling/campaigns/7').flush(campaign('running'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    http
      .expectOne((req) => req.url === '/api/hub/batch-calling/campaigns/7/recipients')
      .flush({ data: [RECIPIENT] });
    await pending;

    expect(fixture.componentInstance.campaign()?.status).toBe('running');
  });

  it('stops a campaign once it is confirmed', async () => {
    const fixture = await render('running');
    dialogResult = true;

    const pending = fixture.componentInstance.cancel();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const request = http.expectOne('/api/hub/batch-calling/campaigns/7/cancel');
    expect(request.request.method).toBe('POST');
    request.flush({ id: 7, status: 'cancelled', message: 'stopped' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    http.expectOne('/api/hub/batch-calling/campaigns/7').flush(campaign('cancelled'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    http
      .expectOne((req) => req.url === '/api/hub/batch-calling/campaigns/7/recipients')
      .flush({ data: [RECIPIENT] });
    await pending;

    expect(fixture.componentInstance.campaign()?.status).toBe('cancelled');
  });

  it('returns to the list after a deletion', async () => {
    const fixture = await render('completed');
    dialogResult = true;

    const pending = fixture.componentInstance.remove();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const request = http.expectOne('/api/hub/batch-calling/campaigns/7');
    expect(request.request.method).toBe('DELETE');
    request.flush({ message: 'deleted' });
    await pending;

    expect(TestBed.inject(Router).url).toBe('/app/campaigns');
  });

  it('keeps the campaign when the deletion is declined', async () => {
    const fixture = await render('completed');
    dialogResult = false;

    await fixture.componentInstance.remove();

    expect(fixture.componentInstance.campaign()?.id).toBe(7);
  });
});
