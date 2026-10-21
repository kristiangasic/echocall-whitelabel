import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import type { IntegrationType } from '../../../core/hub/hub.models';
import { provideTestI18n, USER_TEXTS } from '../../../testing/i18n';
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

/** Its webhook URL carries the secret, so the service masks it although it is a URL field. */
const DISCORD: IntegrationType = {
  type: 'discord',
  name: 'Discord',
  description: 'Nachrichten in einen Kanal senden.',
  requiresApiKey: false,
  configFields: [{ name: 'webhookUrl', label: 'Webhook URL', type: 'url', required: true }],
};

const SMTP: IntegrationType = {
  type: 'smtp',
  name: 'SMTP',
  description: 'E-Mails versenden.',
  requiresApiKey: false,
  configFields: [
    { name: 'host', label: 'Host', type: 'text', required: true },
    { name: 'password', label: 'Password', type: 'password', required: true },
  ],
};

const ORG = '11111111-2222-3333-4444-555555555555';
const CLIENT = '66666666-7777-8888-9999-000000000000';
const QUEUE = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

/** Its lists and limits have no form field; they must survive an edit unchanged. */
const GENESYS: IntegrationType = {
  type: 'genesys_cloud',
  name: 'Genesys Cloud',
  description: 'Contact-Center-Integration.',
  requiresApiKey: true,
  configFields: [
    {
      name: 'region',
      label: 'Region',
      type: 'select',
      required: true,
      options: [
        { label: 'EU (Frankfurt)', value: 'mypurecloud.de' },
        { label: 'EU (Ireland)', value: 'mypurecloud.ie' },
      ],
    },
    { name: 'organizationId', label: 'Organisations-ID', type: 'text', required: true },
    { name: 'oauthClientId', label: 'OAuth Client ID (optional)', type: 'text', required: false },
    { name: 'oauthClientSecret', label: 'OAuth Client Secret (optional)', type: 'password', required: false },
  ],
};

/** A type the portal has no wording for, to show what happens then. */
const UNKNOWN: IntegrationType = {
  type: 'somesuch',
  name: 'Somesuch',
  description: 'Etwas ganz anderes.',
  requiresApiKey: true,
  configFields: [{ name: 'apiKey', label: 'Zugangswort', type: 'password', required: true }],
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

  it('does not connect a service while a required field is empty', async () => {
    const fixture = await render({ types: [TYPE], type: 'calcom' });
    const component = fixture.componentInstance;

    expect(component.name()).toBe('Cal.com');
    expect(component.canSave()).toBe(false);
    await component.save();
    http.expectNone('/api/hub/integrations');

    component.setValue('apiKey', 'cal_live_1');
    expect(component.canSave()).toBe(true);
    http.verify();
  });

  it('does not let a stored required field be cleared', async () => {
    const fixture = await render({ types: [SMTP], integrationId: 6 });
    http.expectOne('/api/hub/integrations/6').flush({
      id: 6,
      type: 'smtp',
      name: 'Mail',
      isActive: true,
      config: JSON.stringify({ host: 'smtp.example.com', password: '********' }),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();

    const component = fixture.componentInstance;
    expect(component.canSave()).toBe(true);
    component.setValue('host', '');
    expect(component.canSave()).toBe(false);
    http.verify();
  });

  it('does not offer to keep a secret the service has not stored', async () => {
    const fixture = await render({ types: [TYPE], integrationId: 4 });
    http.expectOne('/api/hub/integrations/4').flush({
      id: 4,
      type: 'calcom',
      name: 'Termine',
      isActive: true,
      config: JSON.stringify({ eventTypeId: '12' }),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();

    const component = fixture.componentInstance;
    const apiKey = component.fields().find((field) => field.name === 'apiKey')!;
    expect(component.isKept(apiKey)).toBe(false);
    const input: HTMLInputElement = fixture.nativeElement.querySelector(
      '[data-testid="integration-field-apiKey"]',
    );
    expect(input.hasAttribute('required')).toBe(true);
    expect(fixture.nativeElement.textContent).not.toContain(USER_TEXTS.integrations.secretKept);
    // A connection that never had the key can still be renamed or switched off.
    expect(component.canSave()).toBe(true);
    http.verify();
  });

  it('keeps a masked Discord webhook URL and does not ask for it again', async () => {
    const fixture = await render({ types: [DISCORD], integrationId: 5 });
    http.expectOne('/api/hub/integrations/5').flush({
      id: 5,
      type: 'discord',
      name: 'Kanal',
      isActive: true,
      config: JSON.stringify({ webhookUrl: '********' }),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();

    const component = fixture.componentInstance;
    expect(component.value('webhookUrl')).toBe('');
    expect(component.isKept(component.fields()[0])).toBe(true);
    const input: HTMLInputElement = fixture.nativeElement.querySelector(
      '[data-testid="integration-field-webhookUrl"]',
    );
    expect(input.hasAttribute('required')).toBe(false);
    expect(fixture.nativeElement.textContent).toContain(USER_TEXTS.integrations.secretKept);

    const pending = component.save();
    const request = http.expectOne('/api/hub/integrations/5');
    expect(JSON.parse(request.request.body.config)).toEqual({});
    request.flush({ success: true });
    await pending;
    http.verify();
  });

  it('asks for the secret again once the destination changes', async () => {
    const fixture = await render({ types: [SMTP], integrationId: 6 });
    http.expectOne('/api/hub/integrations/6').flush({
      id: 6,
      type: 'smtp',
      name: 'Mail',
      isActive: true,
      config: JSON.stringify({ host: 'smtp.example.com', password: '********' }),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();

    const component = fixture.componentInstance;
    const password = component.fields().find((field) => field.name === 'password')!;
    expect(component.isKept(password)).toBe(true);

    component.setValue('host', 'smtp.other.example');
    expect(component.destinationChanged()).toBe(true);
    expect(component.isKept(password)).toBe(false);
    // Save waits for the password, and the field says why.
    expect(component.canSave()).toBe(false);
    await fixture.whenStable();
    expect(
      fixture.nativeElement.querySelector('[data-testid="integration-secret-again-password"]').textContent,
    ).toContain(USER_TEXTS.integrations.secretAgain);
    component.setValue('password', 'neu');
    expect(component.canSave()).toBe(true);
    component.setValue('password', '');

    component.setValue('host', 'smtp.example.com');
    expect(component.isKept(password)).toBe(true);
    http.verify();
  });

  it('sends the Genesys Cloud lists and limits back in their own types', async () => {
    const fixture = await render({ types: [GENESYS], integrationId: 8 });
    const stored = {
      region: 'mypurecloud.de',
      organizationId: ORG,
      oauthClientId: CLIENT,
      oauthClientSecret: '********',
      handoffTargets: [{ label: 'Support', type: 'queue', queueId: QUEUE }],
      dataTables: [],
      maxConcurrentCalls: 10,
      chatReplySeconds: 12,
      toolPermissions: { preset: 'read' },
    };
    http.expectOne('/api/hub/integrations/8').flush({
      id: 8,
      type: 'genesys_cloud',
      name: 'Contact Center',
      isActive: true,
      config: JSON.stringify(stored),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();

    const component = fixture.componentInstance;
    expect(fixture.nativeElement.querySelector('[data-testid="integration-setup-elsewhere"]')).not.toBeNull();
    component.name.set('Kundenservice');

    const pending = component.save();
    const request = http.expectOne('/api/hub/integrations/8');
    expect(request.request.method).toBe('PATCH');
    expect(JSON.parse(request.request.body.config)).toEqual({
      region: 'mypurecloud.de',
      organizationId: ORG,
      oauthClientId: CLIENT,
      handoffTargets: [{ label: 'Support', type: 'queue', queueId: QUEUE }],
      dataTables: [],
      maxConcurrentCalls: 10,
      chatReplySeconds: 12,
    });
    request.flush({ success: true });
    await pending;

    expect(closed).toBe(true);
    http.verify();
  });

  it('asks for the Genesys Cloud client secret again once the region changes', async () => {
    const fixture = await render({ types: [GENESYS], integrationId: 8 });
    http.expectOne('/api/hub/integrations/8').flush({
      id: 8,
      type: 'genesys_cloud',
      name: 'Contact Center',
      isActive: true,
      config: JSON.stringify({
        region: 'mypurecloud.de',
        organizationId: ORG,
        oauthClientId: CLIENT,
        oauthClientSecret: '********',
      }),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();

    const component = fixture.componentInstance;
    const secret = component.fields().find((field) => field.name === 'oauthClientSecret')!;
    expect(component.isKept(secret)).toBe(true);

    component.setValue('region', 'mypurecloud.ie');
    expect(component.isKept(secret)).toBe(false);
    http.verify();
  });

  it('labels a known field the way the portal does', async () => {
    const fixture = await render({ types: [TYPE], type: 'calcom' });

    const labels = [...fixture.nativeElement.querySelectorAll('mat-label')].map((label: Element) =>
      (label.textContent ?? '').trim(),
    );
    expect(labels).toContain(USER_TEXTS.integrations.types.calcom.fields.eventTypeId);
    expect(labels).not.toContain('Event type');
    http.verify();
  });

  it('keeps the words of the service for a field the portal has no wording for', async () => {
    const fixture = await render({ types: [UNKNOWN], type: 'somesuch' });

    const labels = [...fixture.nativeElement.querySelectorAll('mat-label')].map((label: Element) =>
      (label.textContent ?? '').trim(),
    );
    expect(labels).toContain('Zugangswort');
    expect(fixture.nativeElement.textContent).toContain('Etwas ganz anderes.');
    http.verify();
  });
});
