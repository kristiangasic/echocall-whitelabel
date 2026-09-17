import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { provideTestI18n, USER_TEXTS } from '../../../testing/i18n';
import { IntegrationsPanelComponent } from './integrations-panel.component';

const ASSIGNED = {
  assignmentId: 1,
  id: 4,
  type: 'calcom',
  name: 'Termine',
  isActive: true,
  toolsMode: 'recommended',
  enabledTools: null,
};

const CONNECTED = [
  { id: 4, name: 'Termine', type: 'calcom', isActive: true },
  { id: 5, name: 'Tabellen', type: 'google_sheets', isActive: true },
  { id: 6, name: 'Altlast', type: 'zapier', isActive: false },
];

@Component({
  imports: [IntegrationsPanelComponent],
  template: `<app-integrations-panel [basePath]="basePath()" />`,
})
class Host {
  readonly basePath = signal('/agents/agent_3');
}

describe('IntegrationsPanelComponent', () => {
  let http: HttpTestingController;
  let dialogResult: unknown;

  beforeEach(async () => {
    dialogResult = undefined;
    await TestBed.configureTestingModule({
      imports: [Host, provideTestI18n()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MatDialog, useValue: { open: () => ({ afterClosed: () => of(dialogResult) }) } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function render(assigned: Record<string, unknown>[] = [ASSIGNED]) {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    http.expectOne('/api/hub/agents/agent_3/integrations').flush({ data: assigned });
    http.expectOne('/api/hub/integrations').flush(CONNECTED);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    const panel = fixture.debugElement.children[0].componentInstance as IntegrationsPanelComponent;
    return { fixture, panel };
  }

  it('lists the assigned services with how their tools are chosen', async () => {
    const { fixture } = await render();

    const list = fixture.nativeElement.querySelector('[data-testid="assigned-integrations"]');
    expect(list.textContent).toContain('Termine');
    expect(list.textContent).toContain(USER_TEXTS.integrations.modes.recommended);
  });

  it('offers only active services that are not assigned yet', async () => {
    const { panel } = await render();

    expect(panel.available().map((entry) => entry.id)).toEqual([5]);
  });

  it('attaches a service and reloads', async () => {
    const { panel } = await render();
    panel.selected = 5;

    const pending = panel.attach();
    const request = http.expectOne('/api/hub/agents/agent_3/integrations');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ integrationId: 5 });
    request.flush({ data: { agentType: 'voice', agentId: 3, integrationId: 5 } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    http.expectOne('/api/hub/agents/agent_3/integrations').flush({ data: [ASSIGNED] });
    http.expectOne('/api/hub/integrations').flush(CONNECTED);
    await pending;

    expect(panel.selected).toBeNull();
  });

  it('stores the tool selection the dialog returns', async () => {
    const { panel } = await render();
    dialogResult = { enabledTools: ['book_appointment'] };

    const pending = panel.chooseTools(panel.assigned()[0]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const request = http.expectOne('/api/hub/agents/agent_3/integrations/4');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ enabledTools: ['book_appointment'] });
    request.flush({ data: { id: 1, agentType: 'voice', agentId: 3, integrationId: 4 } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    http.expectOne('/api/hub/agents/agent_3/integrations').flush({ data: [ASSIGNED] });
    http.expectOne('/api/hub/integrations').flush(CONNECTED);
    await pending;

    expect(panel.busy()).toBe(false);
  });

  it('detaches a service', async () => {
    const { panel } = await render();

    const pending = panel.detach(panel.assigned()[0]);
    const request = http.expectOne('/api/hub/agents/agent_3/integrations/4');
    expect(request.request.method).toBe('DELETE');
    request.flush({ message: 'removed' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    http.expectOne('/api/hub/agents/agent_3/integrations').flush({ data: [] });
    http.expectOne('/api/hub/integrations').flush(CONNECTED);
    await pending;

    expect(panel.assigned()).toEqual([]);
  });
});
