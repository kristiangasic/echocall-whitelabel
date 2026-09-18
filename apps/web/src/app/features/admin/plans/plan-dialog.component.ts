import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { readApiError } from '../../../core/errors/api-error';
import { AdminHubService } from '../../../core/hub/admin-hub.service';
import type { CreatePlanInput, Plan, UpdatePlanInput } from '../../../core/hub/hub.models';
import { NotifyService } from '../../../core/notify/notify.service';
import { FieldErrorPipe } from '../../../shared/forms/field-error.pipe';
import { applyServerErrors } from '../../../shared/forms/server-errors';
import { allowanceValidator } from '../../../shared/forms/validators';

export type PlanDialogData = { mode: 'create' } | { mode: 'edit'; plan: Plan };

const TYPES = ['voice', 'chat', 'addon'] as const;
const CYCLES = ['monthly', 'yearly', 'one-time'] as const;

/**
 * Creates a plan or edits the parts of an existing one the hub still accepts:
 * what a plan sells, how often it is charged and how much it includes are fixed
 * once a customer can subscribe to it, so those fields are shown but locked.
 */
@Component({
  selector: 'app-plan-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatButtonModule,
    TranslocoDirective,
    FieldErrorPipe,
  ],
  providers: [provideTranslocoScope('admin')],
  template: `
    <ng-container *transloco="let t">
      <h2 mat-dialog-title>
        {{ t(data.mode === 'create' ? 'admin.plans.dialog.createTitle' : 'admin.plans.dialog.editTitle') }}
      </h2>
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <mat-dialog-content>
          @if (data.mode === 'edit') {
            <p class="hint">{{ t('admin.plans.dialog.editIntro') }}</p>
          }
          <mat-form-field appearance="outline" class="full">
            <mat-label>{{ t('fields.name') }}</mat-label>
            <input matInput formControlName="name" maxlength="100" data-testid="plan-name" />
            @if (form.controls.name | fieldError; as e) {
              <mat-error>{{ t(e.key, e.params) }}</mat-error>
            }
          </mat-form-field>
          <mat-form-field appearance="outline" class="full">
            <mat-label>{{ t('admin.plans.dialog.description') }}</mat-label>
            <textarea matInput rows="2" formControlName="description" maxlength="500"></textarea>
          </mat-form-field>
          <div class="row">
            <mat-form-field appearance="outline">
              <mat-label>{{ t('admin.plans.type') }}</mat-label>
              <mat-select formControlName="type" data-testid="plan-type">
                @for (type of types; track type) {
                  <mat-option [value]="type">{{ t('admin.plans.types.' + type) }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>{{ t('admin.plans.billingCycle') }}</mat-label>
              <mat-select formControlName="billingCycle" data-testid="plan-cycle">
                @for (cycle of cycles; track cycle) {
                  <mat-option [value]="cycle">{{ t('admin.plans.cycles.' + cycle) }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          </div>
          <mat-form-field appearance="outline" class="full">
            <mat-label>{{ t('admin.plans.dialog.price') }}</mat-label>
            <input
              matInput
              type="number"
              step="0.01"
              min="0.01"
              formControlName="priceEur"
              data-testid="plan-price"
            />
            <span matTextSuffix>&nbsp;EUR</span>
            @if (form.controls.priceEur | fieldError; as e) {
              <mat-error>{{ t(e.key, e.params) }}</mat-error>
            }
          </mat-form-field>
          <div class="row limits">
            <mat-form-field appearance="outline">
              <mat-label>{{ t('admin.plans.dialog.voiceMinutes') }}</mat-label>
              <input matInput inputmode="numeric" formControlName="voiceMinutes" data-testid="plan-voice" />
              @if (form.controls.voiceMinutes | fieldError; as e) {
                <mat-error>{{ t(e.key, e.params) }}</mat-error>
              }
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>{{ t('admin.plans.dialog.chatConversations') }}</mat-label>
              <input
                matInput
                inputmode="numeric"
                formControlName="chatConversations"
                data-testid="plan-chat"
              />
              @if (form.controls.chatConversations | fieldError; as e) {
                <mat-error>{{ t(e.key, e.params) }}</mat-error>
              }
            </mat-form-field>
          </div>
          <p class="hint">
            {{ t('admin.plans.dialog.allowanceHint') }}
            @if (form.controls.type.value === 'addon') {
              {{ t('admin.plans.dialog.addonHint') }}
            }
          </p>
          <mat-form-field appearance="outline" class="full" subscriptSizing="dynamic">
            <mat-label>{{ t('admin.plans.dialog.features') }}</mat-label>
            <textarea matInput rows="4" formControlName="features" data-testid="plan-features"></textarea>
            <mat-hint>{{ t('admin.plans.dialog.featuresHint') }}</mat-hint>
          </mat-form-field>
          @if (data.mode === 'edit') {
            <div class="toggles">
              <mat-slide-toggle formControlName="isActive" data-testid="plan-active">
                {{ t('admin.plans.dialog.isActive') }}
              </mat-slide-toggle>
              <mat-slide-toggle formControlName="isVisible" data-testid="plan-visible">
                {{ t('admin.plans.dialog.isVisible') }}
              </mat-slide-toggle>
            </div>
          }
        </mat-dialog-content>
        <mat-dialog-actions align="end">
          <button mat-button type="button" mat-dialog-close>{{ t('actions.cancel') }}</button>
          <button mat-flat-button type="submit" [disabled]="busy()" data-testid="submit">
            {{ t(data.mode === 'create' ? 'admin.plans.dialog.submit' : 'actions.save') }}
          </button>
        </mat-dialog-actions>
      </form>
    </ng-container>
  `,
  styles: `
    mat-dialog-content {
      min-width: min(560px, 90vw);
      padding-top: 8px;
    }
    .hint {
      margin: 0 0 16px;
      color: var(--mat-sys-on-surface-variant);
    }
    /* These two carry the longest labels in the dialog, and half a row cuts
       them off in every language. They take the whole width instead. */
    .limits {
      grid-template-columns: 1fr;
    }
    .toggles {
      display: flex;
      flex-wrap: wrap;
      gap: 24px;
    }
  `,
})
export class PlanDialogComponent {
  readonly data = inject<PlanDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<PlanDialogComponent, boolean>>(MatDialogRef);
  private readonly hub = inject(AdminHubService);
  private readonly notify = inject(NotifyService);
  readonly types = TYPES;
  readonly cycles = CYCLES;
  readonly busy = signal(false);

  private readonly plan = this.data.mode === 'edit' ? this.data.plan : null;

  readonly form = inject(NonNullableFormBuilder).group({
    name: [this.plan?.name ?? '', [Validators.required, Validators.maxLength(100)]],
    description: [this.plan?.description ?? '', Validators.maxLength(500)],
    type: [{ value: (this.plan?.type ?? 'voice') as (typeof TYPES)[number], disabled: this.plan !== null }],
    billingCycle: [
      {
        value: (this.plan?.billingCycle ?? 'monthly') as (typeof CYCLES)[number],
        disabled: this.plan !== null,
      },
    ],
    priceEur: [
      this.plan ? Number(this.plan.priceEur) : (null as number | null),
      [Validators.required, Validators.min(0.01)],
    ],
    voiceMinutes: [
      { value: numberText(this.plan?.voiceMinutesPerMonth), disabled: this.plan !== null },
      allowanceValidator,
    ],
    chatConversations: [
      { value: numberText(this.plan?.chatConversationsPerMonth), disabled: this.plan !== null },
      allowanceValidator,
    ],
    features: [(this.plan?.features ?? []).join('\n')],
    isActive: [this.plan?.isActive ?? true],
    isVisible: [this.plan?.isVisible ?? true],
  });

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    try {
      const value = this.form.getRawValue();
      const features = value.features
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      if (this.plan) {
        const body: UpdatePlanInput = {
          name: value.name.trim(),
          description: value.description.trim(),
          priceEur: Number(value.priceEur),
          features,
          isActive: value.isActive,
          isVisible: value.isVisible,
        };
        await firstValueFrom(this.hub.patch(`/resellers/plans/${this.plan.id}`, body));
      } else {
        const body: CreatePlanInput = {
          name: value.name.trim(),
          type: value.type,
          billingCycle: value.billingCycle,
          priceEur: Number(value.priceEur),
          ...(value.description.trim() ? { description: value.description.trim() } : {}),
          // Only an empty field is left out, which the service reads as no
          // limit. A zero is sent as a zero and stands for nothing included.
          ...(value.voiceMinutes === '' ? {} : { voiceMinutesPerMonth: Number(value.voiceMinutes) }),
          ...(value.chatConversations === ''
            ? {}
            : { chatConversationsPerMonth: Number(value.chatConversations) }),
          ...(features.length ? { features } : {}),
        };
        await firstValueFrom(this.hub.post('/resellers/plans', body));
      }
      this.ref.close(true);
    } catch (err) {
      const error = readApiError(err);
      if (!applyServerErrors(this.form, error)) this.notify.apiError(err);
    } finally {
      this.busy.set(false);
    }
  }
}

/** An allowance as text for the form; null and undefined both mean "no limit". */
function numberText(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}
