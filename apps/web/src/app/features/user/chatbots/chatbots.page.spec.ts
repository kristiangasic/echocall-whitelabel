import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTestI18n, USER_TEXTS } from '../../../testing/i18n';
import { ChatbotsPage } from './chatbots.page';

describe('ChatbotsPage', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChatbotsPage, provideTestI18n()],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function render(chatbots: unknown[]) {
    const fixture = TestBed.createComponent(ChatbotsPage);
    await fixture.whenStable();
    http.expectOne('/api/hub/chatbots').flush({ data: chatbots });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    return fixture;
  }

  it('lists the chatbots the hub reports', async () => {
    const fixture = await render([
      { id: 7, name: 'Shop Helper', language: 'en', status: 'active' },
      { id: 8, name: 'Docs Bot', language: 'en', status: 'inactive' },
    ]);

    const rows = fixture.nativeElement.querySelectorAll('table tbody tr');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Shop Helper');
    expect(rows[0].textContent).toContain(USER_TEXTS.chatbots.statuses.active);
    expect(rows[1].textContent).toContain(USER_TEXTS.chatbots.statuses.inactive);
  });

  it('shows the empty hint without chatbots', async () => {
    const fixture = await render([]);
    expect(fixture.nativeElement.textContent).toContain(USER_TEXTS.chatbots.empty);
  });
});
