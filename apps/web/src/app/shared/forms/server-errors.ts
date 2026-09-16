import type { FormGroup } from '@angular/forms';
import { type ApiError, fieldErrors } from '../../core/errors/api-error';

/** Attaches the per-field messages of a 400 validation_error to the matching controls; true when any matched. */
export function applyServerErrors(form: FormGroup, error: ApiError): boolean {
  let applied = false;
  for (const [path, message] of Object.entries(fieldErrors(error))) {
    const control = form.get(path);
    if (!control) continue;
    control.setErrors({ ...control.errors, server: message });
    control.markAsTouched();
    applied = true;
  }
  return applied;
}
