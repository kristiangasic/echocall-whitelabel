import { Component, computed, DestroyRef, inject, type OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { formatMoney } from '../../../core/format/money';
import { AdminHubService } from '../../../core/hub/admin-hub.service';
import type { ResellerCustomer } from '../../../core/hub/hub.models';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotifyService } from '../../../core/notify/notify.service';
import { type CustomerOption, customerOption } from '../customer-option';

/** How many customers the picker loads at once; the hub caps a page at 500. */
const CUSTOMER_PAGE = 500;

/** The kinds of charge the hub stores on a line item. */
const ITEM_TYPES = ['subscription', 'chat_sessions', 'voice_minutes', 'addon', 'other'] as const;

type ItemType = (typeof ITEM_TYPES)[number];

/** The German rate, which is what most installations will raise invoices at. */
const DEFAULT_TAX_RATE = 19;

/** What the dialog reports back, so the page can name the invoice it created. */
export interface InvoiceDialogResult {
  invoiceId: number;
  invoiceNumber: string;
}

/** Today as the hub wants a date: a plain day, in the operator's own time zone. */
function today(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/** Rounds a euro amount to the cent, so a preview never shows a rounding tail. */
function cents(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Raises one invoice against one customer. The hub works out the totals itself
 * from the line items, so the amounts shown here are a preview of what it will
 * store, never something that is sent along. What is created is a draft: the
 * dialog says so, because nothing goes out to the customer by itself.
 */
@Component({
  selector: 'app-invoice-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
    MatProgressBarModule,
    MatButtonModule,
    TranslocoDirective,
  ],
  providers: [provideTranslocoScope('admin')],
  template: `
    <ng-container *transloco="let t">
      <h2 mat-dialog-title>{{ t('admin.invoices.dialog.title') }}</h2>
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <mat-dialog-content>
          <p class="hint">{{ t('admin.invoices.dialog.intro') }}</p>
          @if (loading()) {
            <mat-progress-bar mode="indeterminate" />
          }
          <mat-form-field appearance="outline" class="full">
            <mat-label>{{ t('admin.invoices.dialog.customer') }}</mat-label>
            <mat-select formControlName="customerId" data-testid="customer">
              @for (customer of customers(); track customer.id) {
                <mat-option [value]="customer.id">{{ customer.label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <div class="row">
            <mat-form-field appearance="outline">
              <mat-label>{{ t('admin.invoices.dialog.invoiceDate') }}</mat-label>
              <input matInput type="date" formControlName="invoiceDate" data-testid="invoice-date" />
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>{{ t('admin.invoices.dialog.dueDate') }}</mat-label>
              <input matInput type="date" formControlName="dueDate" data-testid="due-date" />
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>{{ t('admin.invoices.dialog.taxRate') }}</mat-label>
              <input matInput type="number" min="0" max="100" step="0.1" formControlName="taxRate" />
            </mat-form-field>
          </div>

          <h3 class="section">{{ t('admin.invoices.dialog.items') }}</h3>
          <div formArrayName="items" class="items">
            @for (item of items.controls; track item; let index = $index) {
              <div class="item" [formGroupName]="index">
                <mat-form-field appearance="outline" class="description">
                  <mat-label>{{ t('admin.invoices.dialog.description') }}</mat-label>
                  <input matInput formControlName="description" [attr.data-testid]="'description-' + index" />
                </mat-form-field>
                <mat-form-field appearance="outline" class="type">
                  <mat-label>{{ t('admin.invoices.dialog.type') }}</mat-label>
                  <mat-select formControlName="itemType">
                    @for (type of itemTypes; track type) {
                      <mat-option [value]="type">{{ t('admin.invoices.itemTypes.' + type) }}</mat-option>
                    }
                  </mat-select>
                </mat-form-field>
                <mat-form-field appearance="outline" class="number">
                  <mat-label>{{ t('admin.invoices.dialog.quantity') }}</mat-label>
                  <input matInput type="number" min="0" step="0.01" formControlName="quantity" />
                </mat-form-field>
                <mat-form-field appearance="outline" class="number">
                  <mat-label>{{ t('admin.invoices.dialog.unitPrice') }}</mat-label>
                  <input matInput type="number" min="0" step="0.01" formControlName="unitPrice" />
                </mat-form-field>
                <button
                  mat-icon-button
                  type="button"
                  (click)="removeItem(index)"
                  [disabled]="items.length === 1"
                  [attr.aria-label]="t('admin.invoices.dialog.removeItem')"
                >
                  <mat-icon>delete</mat-icon>
                </button>
              </div>
            }
          </div>
          <button mat-stroked-button type="button" (click)="addItem()" data-testid="add-item">
            <mat-icon>add</mat-icon>
            {{ t('admin.invoices.dialog.addItem') }}
          </button>

          <mat-form-field appearance="outline" class="full notes">
            <mat-label>{{ t('admin.invoices.dialog.notes') }}</mat-label>
            <textarea matInput rows="2" formControlName="notes"></textarea>
          </mat-form-field>

          <dl class="totals" data-testid="totals">
            <div>
              <dt>{{ t('admin.invoices.dialog.net') }}</dt>
              <dd>{{ money(net()) }}</dd>
            </div>
            <div>
              <dt>{{ t('admin.invoices.dialog.tax') }}</dt>
              <dd>{{ money(tax()) }}</dd>
            </div>
            <div class="gross">
              <dt>{{ t('admin.invoices.dialog.gross') }}</dt>
              <dd>{{ money(gross()) }}</dd>
            </div>
          </dl>
        </mat-dialog-content>
        <mat-dialog-actions align="end">
          <button mat-button type="button" mat-dialog-close>{{ t('actions.cancel') }}</button>
          <button mat-flat-button type="submit" [disabled]="busy()" data-testid="submit">
            {{ t('admin.invoices.dialog.submit') }}
          </button>
        </mat-dialog-actions>
      </form>
    </ng-container>
  `,
  styles: `
    mat-dialog-content {
      min-width: min(760px, 90vw);
      padding-top: 8px;
    }
    .hint {
      margin: 0 0 16px;
      color: var(--mat-sys-on-surface-variant);
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }
    /* A date field has to hold dd.mm.yyyy: below this it clips its own
       placeholder, so the row breaks rather than squeezing. */
    .row mat-form-field {
      flex: 1 1 200px;
    }
    .section {
      font: var(--mat-sys-title-small);
      margin: 8px 0;
    }
    .item {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px;
    }
    .item .description {
      flex: 3 1 220px;
    }
    .item .type {
      flex: 2 1 160px;
    }
    .item .number {
      flex: 1 1 110px;
    }
    .notes {
      margin-top: 16px;
    }
    .totals {
      margin: 16px 0 0;
      display: grid;
      gap: 4px;
    }
    .totals div {
      display: flex;
      justify-content: space-between;
      gap: 16px;
    }
    .totals dt,
    .totals dd {
      margin: 0;
    }
    .totals dd {
      font-variant-numeric: tabular-nums;
    }
    .totals .gross {
      font: var(--mat-sys-title-medium);
    }
    @media (max-width: 700px) {
      .item {
        border-bottom: 1px solid var(--mat-sys-outline-variant);
        padding-bottom: 8px;
      }
    }
  `,
})
export class InvoiceDialogComponent implements OnInit {
  private readonly ref = inject<MatDialogRef<InvoiceDialogComponent, InvoiceDialogResult>>(MatDialogRef);
  private readonly hub = inject(AdminHubService);
  private readonly notify = inject(NotifyService);
  private readonly language = inject(LanguageService);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly itemTypes = ITEM_TYPES;
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly customers = signal<CustomerOption[]>([]);

  readonly form = this.fb.group({
    customerId: [null as number | null, Validators.required],
    invoiceDate: [today(), Validators.required],
    dueDate: [''],
    taxRate: [DEFAULT_TAX_RATE, [Validators.min(0), Validators.max(100)]],
    notes: [''],
    items: this.fb.array([this.itemGroup()]),
  });

  /**
   * The typed amounts, mirrored into a signal as they change, so the running
   * totals below the lines re-render without the page being told to.
   */
  private readonly amounts = signal(this.readAmounts());

  readonly net = computed(() =>
    cents(this.amounts().lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0)),
  );
  readonly tax = computed(() => cents((this.net() * this.amounts().taxRate) / 100));
  readonly gross = computed(() => cents(this.net() + this.tax()));

  get items() {
    return this.form.controls.items;
  }

  constructor() {
    this.form.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.amounts.set(this.readAmounts()));
  }

  ngOnInit(): void {
    void this.load();
  }

  money(value: number): string {
    return formatMoney(value, this.language.current());
  }

  addItem(): void {
    this.items.push(this.itemGroup());
  }

  /** The last line stays: an invoice without a single item is refused by the hub. */
  removeItem(index: number): void {
    if (this.items.length === 1) return;
    this.items.removeAt(index);
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    try {
      const value = this.form.getRawValue();
      const notes = value.notes.trim();
      const result = await firstValueFrom(
        this.hub.post<InvoiceDialogResult>('/resellers/invoices', {
          customerId: Number(value.customerId),
          invoiceDate: value.invoiceDate,
          ...(value.dueDate ? { dueDate: value.dueDate } : {}),
          taxRate: Number(value.taxRate),
          items: value.items.map((item) => ({
            description: item.description,
            quantity: Number(item.quantity),
            unitPrice: Number(item.unitPrice),
            itemType: item.itemType,
          })),
          ...(notes ? { notes } : {}),
        }),
      );
      this.ref.close({ invoiceId: result.invoiceId, invoiceNumber: result.invoiceNumber });
    } catch (err) {
      this.notify.apiError(err);
    } finally {
      this.busy.set(false);
    }
  }

  private itemGroup() {
    return this.fb.group({
      description: ['', Validators.required],
      itemType: ['other' as ItemType, Validators.required],
      quantity: [1, [Validators.required, Validators.min(0)]],
      unitPrice: [0, [Validators.required, Validators.min(0)]],
    });
  }

  private readAmounts() {
    const value = this.form.getRawValue();
    return {
      taxRate: Number(value.taxRate) || 0,
      lines: value.items.map((item) => ({
        quantity: Number(item.quantity) || 0,
        unitPrice: Number(item.unitPrice) || 0,
      })),
    };
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      const result = await firstValueFrom(
        this.hub.page<ResellerCustomer>('/resellers/customers', { perPage: CUSTOMER_PAGE }),
      );
      this.customers.set(result.data.map(customerOption));
    } catch (err) {
      this.notify.apiError(err);
    } finally {
      this.loading.set(false);
    }
  }
}
