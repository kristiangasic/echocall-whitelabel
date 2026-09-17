import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { TEXTS, provideTestI18n } from '../../../testing/i18n';
import { AssignNumberDialogComponent } from './assign-number-dialog.component';

const CUSTOMERS = [
  { id: 4, userId: 501, user: { id: 501, email: 'lina@example.com', firstName: 'Lina', lastName: 'Mayer' } },
];

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('AssignNumberDialogComponent', () => {
  let http: HttpTestingController;
  let closed: unknown;

  beforeEach(async () => {
    closed = undefined;
    await TestBed.configureTestingModule({
      imports: [AssignNumberDialogComponent, provideTestI18n()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MAT_DIALOG_DATA, useValue: { phoneNumber: '+4930111222' } },
        {
          provide: MatDialogRef,
          useValue: {
            close: (value: unknown) => {
              closed = value;
            },
          },
        },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function render() {
    const fixture = TestBed.createComponent(AssignNumberDialogComponent);
    await fixture.whenStable();
    http.expectOne((req) => req.url === '/api/admin/hub/resellers/customers').flush({ data: CUSTOMERS });
    await settle();
    fixture.detectChanges();
    return fixture;
  }

  it('names the number it is about and offers every customer', async () => {
    const fixture = await render();

    expect(fixture.nativeElement.textContent).toContain('+4930111222');
    expect(fixture.componentInstance.customers()).toEqual([
      { id: 501, label: 'Lina Mayer (lina@example.com)' },
    ]);
  });

  it('reports the chosen customer back to the page', async () => {
    const fixture = await render();

    fixture.componentInstance.form.setValue({ customerId: 501 });
    fixture.componentInstance.submit();

    expect(closed).toEqual({ customerId: 501 });
  });

  it('closes with nothing when no customer was chosen', async () => {
    const fixture = await render();

    fixture.componentInstance.submit();

    expect(closed).toBeUndefined();
  });
  it('says what is missing instead of doing nothing when the form is submitted empty', async () => {
    const fixture = await render();

    await fixture.componentInstance.submit();
    await settle();
    fixture.detectChanges();
    const errors = Array.from(fixture.nativeElement.querySelectorAll('mat-error') as NodeListOf<HTMLElement>);

    expect(errors.map((error) => error.textContent?.trim())).toContain(TEXTS.validation.required);
  });
});
