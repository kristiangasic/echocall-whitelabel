import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import type { IntegrationPermissions } from '../../../core/hub/hub.models';
import { NotifyService } from '../../../core/notify/notify.service';
import { provideTestI18n, USER_TEXTS } from '../../../testing/i18n';
import { IntegrationPermissionsDialogComponent } from './integration-permissions-dialog.component';

const URL = '/api/hub/integrations/7/permissions';

function tool(key: string, access: 'read' | 'write' | 'delete', allowed: boolean) {
  return {
    key,
    label: key.replace(/_/g, ' '),
    description: `Does ${key}.`,
    descriptionSource: 'catalog' as const,
    access,
    recommended: access === 'read',
    allowed,
  };
}

function permissions(overrides: Partial<IntegrationPermissions> = {}): IntegrationPermissions {
  return {
    integrationId: 7,
    type: 'google_calendar',
    preset: 'read',
    invalid: false,
    tools: [
      tool('list_events', 'read', true),
      tool('create_event', 'write', false),
      tool('delete_event', 'delete', false),
    ],
    presets: {
      read: { count: 1, disabled: false },
      read_write: { count: 2, disabled: false },
      full: { count: 3, disabled: false },
    },
    updatedAt: '2026-10-20T08:00:00.000Z',
    defaultPreset: 'full',
    ...overrides,
  };
}

describe('IntegrationPermissionsDialogComponent', () => {
  let http: HttpTestingController;
  let closed: unknown;
  let messages: string[];

  async function render(answer: IntegrationPermissions | 'missing') {
    closed = undefined;
    messages = [];
    await TestBed.configureTestingModule({
      imports: [IntegrationPermissionsDialogComponent, provideTestI18n()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MAT_DIALOG_DATA, useValue: { integrationId: 7, name: 'Kalender' } },
        { provide: MatDialogRef, useValue: { close: (value: unknown) => (closed = value) } },
        {
          provide: NotifyService,
          useValue: {
            success: (key: string) => messages.push(`success:${key}`),
            error: (key: string) => messages.push(`error:${key}`),
            apiError: () => messages.push('apiError'),
          },
        },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(IntegrationPermissionsDialogComponent);
    fixture.detectChanges();
    const request = http.expectOne(URL);
    if (answer === 'missing') {
      request.flush(
        { error: { code: 'not_found', message: 'Integration not found' } },
        { status: 404, statusText: 'Not Found' },
      );
    } else {
      request.flush({ data: answer });
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    return fixture;
  }

  it('shows the stored preset with what each preset allows', async () => {
    const fixture = await render(permissions());
    const component = fixture.componentInstance;

    expect(component.preset()).toBe('read');
    expect(component.options().map((option) => option.key)).toEqual(['read', 'read_write', 'full', 'custom']);
    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain(USER_TEXTS.integrations.permissions.presets.read_write.label);
    expect(text).toContain('2 of 3 actions allowed.');
    expect(text).toContain(USER_TEXTS.integrations.permissions.defaultBadge);
    http.verify();
  });

  it('says so when the service has no permissions to set', async () => {
    const fixture = await render('missing');

    expect(fixture.componentInstance.notAvailable()).toBe(true);
    expect(fixture.nativeElement.querySelector('[data-testid="permissions-not-available"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="permissions-save"]')).toBeNull();
    expect(messages).toEqual([]);
    expect(closed).toBeUndefined();
    http.verify();
  });

  it('saves a preset and reports the updated assistants', async () => {
    const fixture = await render(permissions());
    const component = fixture.componentInstance;
    component.choose('read_write');

    const pending = component.save();
    const request = http.expectOne(URL);
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ preset: 'read_write' });
    request.flush({ data: permissions({ preset: 'read_write' }), agentsResynced: 2, agentsFailed: 0 });
    await pending;

    expect(messages).toEqual(['success:user.integrations.permissions.savedAssistants']);
    expect(closed).toBe(true);
    http.verify();
  });

  it('saves exactly the picked tools for a custom choice', async () => {
    const fixture = await render(permissions());
    const component = fixture.componentInstance;
    component.choose('custom');
    fixture.detectChanges();
    expect(component.selected()).toEqual(new Set(['list_events']));

    component.toggle('create_event', true);
    const pending = component.save();
    const request = http.expectOne(URL);
    expect(request.request.body).toEqual({ preset: 'custom', tools: ['list_events', 'create_event'] });
    request.flush({ data: permissions({ preset: 'custom' }), agentsResynced: 0, agentsFailed: 1 });
    await pending;

    expect(messages).toEqual(['error:user.integrations.permissions.agentsFailed']);
    http.verify();
  });

  it('does not save an empty custom choice', async () => {
    const fixture = await render(permissions());
    const component = fixture.componentInstance;
    component.choose('custom');
    component.selectAll(false);
    fixture.detectChanges();

    expect(component.canSave()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain(USER_TEXTS.integrations.permissions.customEmpty);
    http.verify();
  });

  it('warns before full access', async () => {
    const fixture = await render(permissions());
    fixture.componentInstance.choose('full');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="permissions-full-warning"]')).not.toBeNull();
    http.verify();
  });

  it('shows the earlier scope while it is stored but does not save it again', async () => {
    const fixture = await render(permissions({ preset: 'legacy', updatedAt: null }));
    const component = fixture.componentInstance;

    expect(component.options()[0].key).toBe('legacy');
    expect(component.canSave()).toBe(false);
    component.choose('read');
    expect(component.canSave()).toBe(true);
    http.verify();
  });

  it('makes the operator choose again when the stored choice could not be read', async () => {
    const fixture = await render(
      permissions({
        preset: 'custom',
        invalid: true,
        updatedAt: null,
        tools: [tool('list_events', 'read', false)],
      }),
    );
    const component = fixture.componentInstance;

    expect(component.preset()).toBeNull();
    expect(component.canSave()).toBe(false);
    expect(fixture.nativeElement.querySelector('[data-testid="permissions-invalid"]')).not.toBeNull();
    http.verify();
  });

  it('does not offer a preset that allows nothing', async () => {
    const fixture = await render(
      permissions({
        presets: {
          read: { count: 1, disabled: false },
          read_write: { count: 0, disabled: true },
          full: { count: 3, disabled: false },
        },
      }),
    );
    const component = fixture.componentInstance;
    component.choose('read_write');

    expect(component.canSave()).toBe(false);
    http.verify();
  });
});
