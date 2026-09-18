import { MediaMatcher } from '@angular/cdk/layout';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  DestroyRef,
  effect,
  inject,
  Injectable,
  PLATFORM_ID,
  RendererFactory2,
  signal,
} from '@angular/core';

const DARK_MODES = ['light', 'dark', 'system'] as const;
export type DarkMode = (typeof DARK_MODES)[number];

const STORAGE_KEY = 'darkMode';

@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly document = inject(DOCUMENT);
  private readonly renderer = inject(RendererFactory2).createRenderer(null, null);
  private readonly destroyRef = inject(DestroyRef);
  private readonly query = inject(MediaMatcher).matchMedia('(prefers-color-scheme: dark)');

  private readonly _darkMode = signal<DarkMode>(this.readStoredMode());
  private readonly _systemPrefersDark = signal<boolean>(false);

  constructor() {
    if (!isPlatformBrowser(this.platformId)) return;

    this._systemPrefersDark.set(this.query.matches);

    const handleChange = (e: MediaQueryListEvent) => this._systemPrefersDark.set(e.matches);
    this.query.addEventListener('change', handleChange);
    this.destroyRef.onDestroy(() => this.query.removeEventListener('change', handleChange));

    effect(() => {
      const mode = this._darkMode();
      const systemDark = this._systemPrefersDark();
      const shouldBeDark = mode === 'dark' || (mode === 'system' && systemDark);

      if (shouldBeDark) {
        this.renderer.addClass(this.document.documentElement, 'dark');
      } else {
        this.renderer.removeClass(this.document.documentElement, 'dark');
      }
    });
  }

  setDarkMode(mode: DarkMode): void {
    localStorage.setItem(STORAGE_KEY, mode);
    this._darkMode.set(mode);
  }

  toggleMode(): void {
    const mode = this._darkMode();
    this.setDarkMode(mode === 'light' ? 'dark' : 'light');
  }

  private readStoredMode(): DarkMode {
    if (typeof localStorage === 'undefined') return 'system';
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && DARK_MODES.includes(stored as DarkMode)) {
      return stored as DarkMode;
    }
    return 'system';
  }
}
