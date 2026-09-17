import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideTestI18n } from '../../../testing/i18n';
import { EmbedDialogComponent } from './embed-dialog.component';

describe('EmbedDialogComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EmbedDialogComponent, provideTestI18n()],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: { chatbotId: 7 } },
        { provide: MatDialogRef, useValue: { close: () => undefined } },
      ],
    }).compileComponents();
  });

  it('builds a snippet that points at this portal, not at the hub', async () => {
    const fixture = TestBed.createComponent(EmbedDialogComponent);
    await fixture.whenStable();

    const snippet = fixture.nativeElement.querySelector('[data-testid="embed-snippet"]').textContent;
    expect(snippet).toContain(`${location.origin}/embed/chat.js`);
    expect(snippet).toContain('data-id="7"');
    expect(snippet).not.toContain('echocall.de');
  });
});
