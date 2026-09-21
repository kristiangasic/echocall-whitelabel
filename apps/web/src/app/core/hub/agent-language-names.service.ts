import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdminHubService } from './admin-hub.service';
import type { AgentLanguage } from './hub.models';
import { HubService } from './hub.service';

/** Which proxy the table is fetched through. */
export type LanguageSurface = 'customer' | 'operator';

/**
 * Names a stored language code.
 *
 * An agent keeps its language as a code, so a list that prints the code raw
 * asks the reader to know that "ny" means Chichewa. The service reads the
 * service's own table of languages once per surface and shares it across every
 * page of the session; a code it does not find is printed as it is, which is
 * still better than nothing.
 */
@Injectable({ providedIn: 'root' })
export class AgentLanguageNames {
  private readonly hub = inject(HubService);
  private readonly adminHub = inject(AdminHubService);
  private readonly pending = new Map<LanguageSurface, Promise<void>>();
  private readonly byCode = signal<Record<string, AgentLanguage>>({});

  /** Fetches the table once per surface. Later callers wait on the first call. */
  load(surface: LanguageSurface = 'customer'): Promise<void> {
    const running = this.pending.get(surface);
    if (running) return running;
    const started = this.fetch(surface).catch(() => {
      // A list that shows codes is a small loss; a list that fails to load is not.
      this.pending.delete(surface);
    });
    this.pending.set(surface, started);
    return started;
  }

  /** The language to print for a stored code, in the language's own words. */
  name(code: string | null | undefined): string {
    if (!code) return '';
    return this.byCode()[normalize(code)]?.nativeName ?? code.toUpperCase();
  }

  /** The English name, for a tooltip next to the native one. */
  englishName(code: string | null | undefined): string {
    if (!code) return '';
    return this.byCode()[normalize(code)]?.name ?? code.toUpperCase();
  }

  private async fetch(surface: LanguageSurface): Promise<void> {
    const api = surface === 'operator' ? this.adminHub : this.hub;
    const languages = await firstValueFrom(
      api.list<AgentLanguage>('/languages/agent', { type: 'all' }),
    );
    const merged = { ...this.byCode() };
    for (const language of languages) merged[normalize(language.code)] = language;
    this.byCode.set(merged);
  }
}

/** Codes are stored in more than one spelling, for example "pt_BR" and "pt-br". */
function normalize(code: string): string {
  return code.trim().toLowerCase().replace(/_/g, '-');
}
