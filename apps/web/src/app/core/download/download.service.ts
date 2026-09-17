import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';

/**
 * Hands a downloaded file to the browser. Kept behind a service so pages stay
 * testable: a spec replaces this instead of reaching into the document.
 */
@Injectable({ providedIn: 'root' })
export class DownloadService {
  private readonly document = inject(DOCUMENT);

  save(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = this.document.createElement('a');
    link.href = url;
    link.download = filename;
    this.document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }
}
