import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import type { IntegrationType } from '../../../core/hub/hub.models';
import { provideTestI18n } from '../../../testing/i18n';
import { IntegrationDialogComponent, type IntegrationDialogData } from './integration-dialog.component';

const TYPE: IntegrationType = {
  type: 'calcom',
  name: 'Cal.com',
  description: 'Termine buchen und absagen.',
  requiresApiKey: true,
  configFields: [
    { name: 'apiKey', label: 'API key', type: 'password', required: true },
    { name: 'eventTypeId', label: 'Event type', type: 'text', required: false },
  ],
};

describe('IntegrationDialogComponent', () => {
  let http: HttpTestingController;
  let closed: unknown;

  async function render(data: IntegrationDialogData) {
    closed = undefined;
    await TestBed.configureTestingModule({
      imports: [IntegrationDialogComponent, provideTestI18n()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: { close: (value: unknown) => (closed = value) } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(IntegrationDialogComponent);
    await fixture.whenStable();
    return fixture;
  }

  it('renders the configuration fields of the chosen type', async () => {
    const fixture = await render({ types: [TYPE], type: 'calcom' });

    expect(fixture.nativeElement.querySelector('[data-testid="integration-field-apiKey"]')).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector('[data-testid="integration-field-eventTypeId"]'),
    ).not.toBeNull();
    http.verify();
  });

  it('sends the configuration as a JSON string', async () => {
    const fixture = await render({ types: [TYPE], type: 'calcom' });
    const component = fixture.componentInstance;
    component.name.set('Termine');
    component.setValue('apiKey', 'cal_live_1');

    const pending = component.save();
    const request = http.expectOne('/api/hub/integrations');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      type: 'calcom',
      name: 'Termine',
      config: JSON.stringify({ apiKey: 'cal_live_1' }),
    });
    request.flush({ success: true, integrationId: 9 });
    await pending;

    expect(closed).toBe(true);
    http.verify();
  });

  it('keeps a stored secret when the field is left empty', async () => {
    const fixture = await render({ types: [TYPE], integrationId: 4 });
    http.expectOne('/api/hub/integrations/4').flush({
      id: 4,
      type: 'calcom',
      name: 'Termine',
      isActive: true,
      config: JSON.stringify({ apiKey: '********', eventTypeId: '12' }),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();

    expect(fixture.componentInstance.value('apiKey')).toBe('');
    expect(fixture.componentInstance.value('eventTypeId')).toBe('12');

    const pending = fixture.componentInstance.save();
    const request = http.expectOne('/api/hub/integrations/4');
    expect(request.request.method).toBe('PATCH');
    expect(JSON.parse(request.request.body.config)).toEqual({ eventTypeId: '12' });
    request.flush({ success: true });
    await pending;

    expect(closed).toBe(true);
    http.verify();
  });
});
