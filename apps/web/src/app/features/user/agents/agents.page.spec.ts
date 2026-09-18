import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTestI18n, USER_TEXTS } from '../../../testing/i18n';
import { AgentsPage } from './agents.page';

describe('AgentsPage', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AgentsPage, provideTestI18n()],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function render(agents: unknown[]) {
    const fixture = TestBed.createComponent(AgentsPage);
    await fixture.whenStable();
    http.expectOne('/api/hub/agents').flush({ data: agents });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    return fixture;
  }

  it('lists the agents the hub reports', async () => {
    const fixture = await render([
      {
        id: 'agent_1',
        name: 'Support Line',
        language: 'en',
        status: 'active',
        voice: { id: 'voice_2', name: 'Clara' },
      },
      { id: 'agent_2', name: 'After Hours', language: 'en', status: 'inactive' },
    ]);

    const rows = fixture.nativeElement.querySelectorAll('table tbody tr');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Support Line');
    expect(rows[0].textContent).toContain('Clara');
    expect(rows[0].textContent).toContain(USER_TEXTS.agents.statuses.active);
    expect(rows[1].textContent).toContain(USER_TEXTS.agents.statuses.inactive);
  });

  it('names the standard voice for an agent that picked none', async () => {
    const fixture = await render([{ id: 'agent_2', name: 'After Hours', language: 'en', status: 'active' }]);

    const row = fixture.nativeElement.querySelector('table tbody tr');
    expect(row.textContent).toContain(USER_TEXTS.agents.voiceDefault);
  });

  it('shows the empty hint without agents', async () => {
    const fixture = await render([]);
    expect(fixture.nativeElement.textContent).toContain(USER_TEXTS.agents.empty);
  });
});
