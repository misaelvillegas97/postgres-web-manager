import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ViewportService {
  private readonly query = '(max-width: 768px)';
  private readonly mobile = signal(false);

  readonly isMobile = this.mobile.asReadonly();

  constructor() {
    if (
      typeof window === 'undefined' ||
      typeof window.matchMedia !== 'function'
    ) {
      return;
    }

    const media = window.matchMedia(this.query);
    this.mobile.set(media.matches);
    media.addEventListener('change', (event) => this.mobile.set(event.matches));
  }
}
