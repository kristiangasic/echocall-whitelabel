import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { provideTestI18n } from '../../../testing/i18n';
import { CampaignDialogComponent } from './campaign-dialog.component';

const AGENT = { id: 3, name: 'Empfang', isActive: true };

describe('CampaignDialogComponent', () => {
  let http: HttpTestingController;
  let closed: unknown;

  beforeEach(async () => {
    closed = undefined;
    await TestBed.configureTestingModule({
      imports: [CampaignDialogComponent, provideTestI18n()],
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
    const fixture = TestBed.createComponent(CampaignDialogComponent);
    await fixture.whenStable();
    http.expectOne('/api/hub/agents').flush({ data: [AGENT] });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    return fixture;
  }

  it('offers the customer their voice agents', async () => {
    const fixture = await render();

    expect(fixture.componentInstance.agents()).toEqual([AGENT]);
  });

  it('counts the recipients while they are pasted', async () => {
    const fixture = await render();

    fixture.componentInstance.recipients.set('+4930111\n+4930222, Jan');
    await fixture.whenStable();

    expect(fixture.componentInstance.parsed().length).toBe(2);
    expect(fixture.nativeElement.querySelector('[data-testid="campaign-count"]').textContent).toContain(
      '2',
    );
  });

  it('refuses to save without a name, an agent or recipients', async () => {
    const fixture = await render();
    const component = fixture.componentInstance;

    expect(component.canSave()).toBe(false);

    component.name.set('Rueckrufaktion');
    expect(component.canSave()).toBe(false);

    component.agentId.set(3);
    expect(component.canSave()).toBe(false);

    component.recipients.set('+4930111');
    expect(component.canSave()).toBe(true);
  });

  it('sends the parsed recipients and reports the new campaign', async () => {
    const fixture = await render();
    const component = fixture.componentInstance;
    component.name.set('Rueckrufaktion');
    component.agentId.set(3);
    component.recipients.set('+4930111, Maria\n+4930222');

    const pending = component.save();
    const request = http.expectOne('/api/hub/batch-calling/campaigns');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      name: 'Rueckrufaktion',
      agentId: 3,
      recipients: [
        { phoneNumber: '+4930111', name: 'Maria' },
        { phoneNumber: '+4930222' },
      ],
    });
    request.flush({ id: 9, name: 'Rueckrufaktion', status: 'draft' });
    await pending;

    expect(closed).toEqual({ id: 9 });
  });
});
