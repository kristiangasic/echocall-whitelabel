import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { TEXTS, provideTestI18n } from '../../../testing/i18n';
import { ChatbotEditPage } from './chatbot-edit.page';

@Component({ template: '' })
class BlankPage {}

describe('ChatbotEditPage', () => {
  let http: HttpTestingController;
  let router: Router;

  async function setup(id: string) {
    await TestBed.configureTestingModule({
      imports: [ChatbotEditPage, provideTestI18n()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: 'app/chatbots', component: BlankPage }]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id }) } } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    const fixture = TestBed.createComponent(ChatbotEditPage);
    await fixture.whenStable();
    http.expectOne('/api/hub/languages').flush([{ code: 'de' }, { code: 'en' }]);
    return fixture;
  }

  afterEach(() => http.verify());

  it('creates a chatbot and turns the domain list into an array', async () => {
    const fixture = await setup('new');
    await fixture.whenStable();

    fixture.componentInstance.form.patchValue({
      name: 'Shop Helper',
      language: 'de',
      allowedDomains: 'example.com, shop.example.com',
    });
    const pending = fixture.componentInstance.save();

    const request = http.expectOne('/api/hub/chatbots');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toMatchObject({
      name: 'Shop Helper',
      language: 'de',
      allowedDomains: ['example.com', 'shop.example.com'],
      widgetPosition: 'bottom-right',
      textOnlyMode: true,
      retentionDays: 30,
    });
    expect(request.request.body).not.toHaveProperty('status');
    request.flush({ id: 7, name: 'Shop Helper', status: 'active' }, { status: 201, statusText: 'Created' });
    await pending;
    expect(router.url).toBe('/app/chatbots');
  });

  it('loads a chatbot and patches only the changed fields', async () => {
    const fixture = await setup('7');
    http.expectOne('/api/hub/chatbots/7').flush({
      id: 7,
      name: 'Shop Helper',
      language: 'de',
      status: 'active',
      greeting: 'Hallo',
      allowedDomains: ['example.com'],
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    http.expectOne('/api/hub/chatbots/7/knowledge').flush({ data: [] });
    http.expectOne('/api/hub/chatbots/7/integrations').flush({ data: [] });
    http.expectOne('/api/hub/integrations').flush([]);
    await fixture.whenStable();

    const form = fixture.componentInstance.form;
    expect(form.controls.name.value).toBe('Shop Helper');
    expect(form.controls.allowedDomains.value).toBe('example.com');
    form.controls.greeting.setValue('Guten Tag');
    form.controls.greeting.markAsDirty();
    const pending = fixture.componentInstance.save();

    const request = http.expectOne('/api/hub/chatbots/7');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ greeting: 'Guten Tag' });
    request.flush({ id: 7 });
    await pending;
    expect(router.url).toBe('/app/chatbots');
  });
  it('says the name is missing instead of doing nothing', async () => {
    const fixture = await setup('new');
    await fixture.whenStable();

    await fixture.componentInstance.save();
    fixture.detectChanges();
    const errors = Array.from(fixture.nativeElement.querySelectorAll('mat-error') as NodeListOf<HTMLElement>);

    expect(errors.map((error) => error.textContent?.trim())).toContain(TEXTS.validation.required);
  });
});
