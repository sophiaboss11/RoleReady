import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowUpRight,
  lucideBarChart3,
  lucideBrain,
  lucideCheck,
  lucideDatabase,
  lucideGamepad2,
  lucideGlobe,
  lucideHeadphones,
  lucidePlay,
  lucideShield,
  lucideSparkles,
  lucideZap,
} from '@ng-icons/lucide';
import {
  DASHBOARD_STATS,
  FEATURE_SPOTLIGHTS,
  FOOTER_LINKS,
  HERO_METRICS,
  HERO_PROGRESS_BARS,
  HERO_SIDEBAR_ITEMS,
  HOW_IT_WORKS_STEPS,
  INGESTION_SOURCES,
  INTEGRATION_ITEMS,
  LEADERBOARD_ENTRIES,
  NAV_LINKS,
  OUTCOME_STATS,
  PLATFORM_FEATURES,
  PRICING_PLANS,
  TEAM_PROGRESS,
  TESTIMONIALS,
  WEEKDAY_STREAK,
} from './landing-page.content';
import { ServiceIcon } from '../shared/ui/service-icon';

interface CountUpTarget {
  readonly prefix: string;
  readonly numericTarget: number;
  readonly suffix: string;
  readonly isFloat: boolean;
  readonly original: string;
}

@Component({
  selector: 'app-landing-page',
  imports: [RouterLink, NgIcon, ServiceIcon],
  providers: [
    provideIcons({
      lucideArrowUpRight,
      lucideBarChart3,
      lucideBrain,
      lucideCheck,
      lucideDatabase,
      lucideGamepad2,
      lucideGlobe,
      lucideHeadphones,
      lucidePlay,
      lucideShield,
      lucideSparkles,
      lucideZap,
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './landing-page.html',
  styleUrl: './landing-page.css',
})
export class LandingPage implements AfterViewInit {
  private readonly destroyRef = inject(DestroyRef);

  @ViewChild('outcomesPanel') private outcomesPanelRef?: ElementRef<HTMLElement>;
  @ViewChild('featuresSection') private featuresSectionRef?: ElementRef<HTMLElement>;

  protected readonly scrolled = signal(false);
  protected readonly spotlightsVisible = signal(false);
  protected readonly outcomesVisible = signal(false);
  protected readonly navLinks = NAV_LINKS;
  protected readonly heroMetrics = HERO_METRICS;
  protected readonly heroSidebarItems = HERO_SIDEBAR_ITEMS;
  protected readonly heroProgressBars = HERO_PROGRESS_BARS;
  protected readonly integrationItems = INTEGRATION_ITEMS;
  protected readonly integrationMarqueeItems = Array.from({ length: 4 }, (_, copyIndex) =>
    this.integrationItems.map((item) => ({
      ...item,
      id: `${copyIndex}-${item.name}`,
      hidden: copyIndex > 0,
    })),
  ).flat();
  protected readonly howItWorksSteps = HOW_IT_WORKS_STEPS;
  protected readonly featureSpotlights = FEATURE_SPOTLIGHTS;
  protected readonly weekdayStreak = WEEKDAY_STREAK;
  protected readonly leaderboardEntries = LEADERBOARD_ENTRIES;
  protected readonly ingestionSources = INGESTION_SOURCES;
  protected readonly dashboardStats = DASHBOARD_STATS;
  protected readonly teamProgress = TEAM_PROGRESS;
  protected readonly platformFeatures = PLATFORM_FEATURES;
  protected readonly outcomeStats = OUTCOME_STATS;
  protected readonly animatedOutcomeValues = signal(
    OUTCOME_STATS.map((stat) => this.createInitialCountUpValue(stat.value)),
  );
  protected readonly testimonials = TESTIMONIALS;
  protected readonly pricingPlans = PRICING_PLANS;
  protected readonly footerLinks = FOOTER_LINKS;
  protected readonly currentYear = 2026;

  ngAfterViewInit(): void {
    this.observeFeaturesSection();
    this.observeOutcomesPanel();
  }

  @HostListener('window:scroll')
  protected onWindowScroll(): void {
    if (typeof window === 'undefined') {
      return;
    }

    this.scrolled.set(window.scrollY > 50);
  }

  private observeOutcomesPanel(): void {
    if (typeof window === 'undefined' || !this.outcomesPanelRef?.nativeElement) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting || this.outcomesVisible()) {
          return;
        }

        this.outcomesVisible.set(true);
        this.animateOutcomeStats();
        observer.disconnect();
      },
      { threshold: 0.35 },
    );

    observer.observe(this.outcomesPanelRef.nativeElement);
    this.destroyRef.onDestroy(() => observer.disconnect());
  }

  private observeFeaturesSection(): void {
    if (typeof window === 'undefined' || !this.featuresSectionRef?.nativeElement) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting || this.spotlightsVisible()) {
          return;
        }

        this.spotlightsVisible.set(true);
        observer.disconnect();
      },
      { threshold: 0.2 },
    );

    observer.observe(this.featuresSectionRef.nativeElement);
    this.destroyRef.onDestroy(() => observer.disconnect());
  }

  private animateOutcomeStats(): void {
    const parsedTargets = this.outcomeStats.map((stat) => this.parseCountUpTarget(stat.value));
    const duration = 1800;
    const startTime = performance.now();

    const tick = (now: number): void => {
      const progress = Math.min((now - startTime) / duration, 1);
      const easedProgress = 1 - Math.pow(1 - progress, 3);

      this.animatedOutcomeValues.set(
        parsedTargets.map((target) => this.formatCountUpValue(target, easedProgress)),
      );

      if (progress < 1) {
        requestAnimationFrame(tick);
      }
    };

    requestAnimationFrame(tick);
  }

  private createInitialCountUpValue(target: string): string {
    return this.formatCountUpValue(this.parseCountUpTarget(target), 0);
  }

  private parseCountUpTarget(target: string): CountUpTarget {
    const match = target.match(/^([^0-9]*)([0-9.]+)(.*)$/);

    if (!match) {
      return {
        prefix: '',
        numericTarget: Number.NaN,
        suffix: '',
        isFloat: false,
        original: target,
      };
    }

    return {
      prefix: match[1],
      numericTarget: Number.parseFloat(match[2]),
      suffix: match[3],
      isFloat: match[2].includes('.'),
      original: target,
    };
  }

  private formatCountUpValue(target: CountUpTarget, progress: number): string {
    if (Number.isNaN(target.numericTarget)) {
      return target.original;
    }

    const currentValue = target.numericTarget * progress;
    const numericDisplay = target.isFloat
      ? currentValue.toFixed(1)
      : String(Math.round(currentValue));
    return `${target.prefix}${numericDisplay}${target.suffix}`;
  }
}
