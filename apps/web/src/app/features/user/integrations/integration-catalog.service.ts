import { inject, Injectable } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import type { IntegrationType } from '../../../core/hub/hub.models';

/**
 * Services the portal cannot set up to the end: their access data are issued
 * only by the provider of the service, so a connection made here would never
 * work. They are not offered to connect; a connection that already exists can
 * still be renamed, switched off, given permissions and deleted.
 */
export const SETUP_OUTSIDE_PORTAL: ReadonlySet<string> = new Set(['genesys_cloud']);

/**
 * The catalog of connectable services is written once, in one language, by the
 * platform the portal talks to. The portal keeps its own wording for the
 * entries it knows and falls back to what the platform sent for anything it
 * does not, because a sentence in the wrong language still reads better than an
 * empty card.
 */
@Injectable({ providedIn: 'root' })
export class IntegrationCatalogService {
  private readonly transloco = inject(TranslocoService);

  /** What a catalog entry does, in the reader's language. */
  description(entry: IntegrationType): string {
    return this.text(`${entry.type}.description`, entry.description);
  }

  /** The name of one of the fields an entry asks for. */
  fieldLabel(type: string, field: string, fallback: string): string {
    return this.text(`${type}.fields.${asKey(field)}`, fallback);
  }

  /** The example that stands in an empty field until something is typed into it. */
  fieldHint(type: string, field: string, fallback: string): string {
    return this.text(`${type}.hints.${asKey(field)}`, fallback);
  }

  /** One choice of a field that offers a list of them. */
  optionLabel(type: string, field: string, value: string, fallback: string): string {
    return this.text(`${type}.options.${asKey(field)}.${asKey(value)}`, fallback);
  }

  private text(path: string, fallback: string): string {
    const key = `user.integrations.types.${path}`;
    const translated: unknown = this.transloco.translate(key);
    return typeof translated === 'string' && translated !== key ? translated : fallback;
  }
}

/** A field name as a translation key can spell it; some of them carry a dot. */
function asKey(name: string): string {
  return name.replace(/\./g, '-');
}
