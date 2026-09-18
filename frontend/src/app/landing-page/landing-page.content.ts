export type LandingIconName =
  | 'lucideBarChart3'
  | 'lucideBookOpen'
  | 'lucideBrain'
  | 'lucideDatabase'
  | 'lucideFolderOpen'
  | 'lucideGamepad2'
  | 'lucideGithub'
  | 'lucideGlobe'
  | 'lucideHeadphones'
  | 'lucideKanban'
  | 'lucideNotebookText'
  | 'lucideShield'
  | 'lucideSparkles'
  | 'lucideZap';

export interface NavLink {
  readonly label: string;
  readonly href: `#${string}`;
}

export interface HeroMetric {
  readonly value: string;
  readonly label: string;
}

export interface HeroProgressBar {
  readonly label: string;
  readonly progress: number;
}

export interface IntegrationItem {
  readonly name: string;
  readonly logo: 'github' | 'jira' | 'confluence' | 'google-drive' | 'notion';
}

export interface HowItWorksStep {
  readonly step: string;
  readonly title: string;
  readonly description: string;
}

export type SpotlightVisual = 'dashboard' | 'gamification' | 'ingestion';

export interface FeatureSpotlight {
  readonly icon: LandingIconName;
  readonly title: string;
  readonly description: string;
  readonly ctaLabel: string;
  readonly ctaHref: `#${string}` | '/login';
  readonly reverse: boolean;
  readonly visual: SpotlightVisual;
}

export interface PlatformFeature {
  readonly icon: LandingIconName;
  readonly title: string;
  readonly description: string;
}

export interface StreakDay {
  readonly label: string;
  readonly completed: boolean;
}

export interface LeaderboardEntry {
  readonly rank: number;
  readonly name: string;
  readonly xp: string;
  readonly highlighted: boolean;
}

export type IngestionTone = 'accent' | 'muted' | 'primary';

export interface IngestionSource {
  readonly source: string;
  readonly assetCount: string;
  readonly statusLabel: string;
  readonly tone: IngestionTone;
}

export interface DashboardStat {
  readonly label: string;
  readonly value: string;
}

export interface TeamProgress {
  readonly team: string;
  readonly progress: number;
}

export interface OutcomeStat {
  readonly value: string;
  readonly label: string;
}

export interface Testimonial {
  readonly name: string;
  readonly role: string;
  readonly quote: string;
}

export interface PricingPlan {
  readonly name: string;
  readonly price: string;
  readonly period: string;
  readonly description: string;
  readonly features: readonly string[];
  readonly ctaLabel: string;
  readonly featured: boolean;
}

export interface FooterLink {
  readonly label: string;
  readonly href: `#${string}`;
}

export const NAV_LINKS: readonly NavLink[] = [
  { label: 'Features', href: '#features' },
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'Integrations', href: '#integrations' },
  { label: 'Pricing', href: '#pricing' },
];

export const HERO_METRICS: readonly HeroMetric[] = [
  { value: '85%', label: 'faster time to first contribution' },
  { value: '3.5x', label: 'higher knowledge retention' },
  { value: '92%', label: 'completion across new hire cohorts' },
];

export const HERO_SIDEBAR_ITEMS: readonly string[] = [
  'Adaptive missions',
  'Role-based paths',
  'Knowledge sync',
  'Manager dashboard',
];

export const HERO_PROGRESS_BARS: readonly HeroProgressBar[] = [
  { label: 'Engineering onboarding', progress: 75 },
  { label: 'Product fundamentals', progress: 92 },
  { label: 'Security readiness', progress: 60 },
  { label: 'Team workflows', progress: 88 },
];

export const INTEGRATION_ITEMS: readonly IntegrationItem[] = [
  { name: 'GitHub', logo: 'github' },
  { name: 'Jira', logo: 'jira' },
  { name: 'Confluence', logo: 'confluence' },
  { name: 'Google Drive', logo: 'google-drive' },
  { name: 'Notion', logo: 'notion' },
];

export const HOW_IT_WORKS_STEPS: readonly HowItWorksStep[] = [
  {
    step: '01',
    title: 'Connect your sources',
    description:
      'Bring in repositories, tickets, docs, wiki pages, and internal knowledge in one pass.',
  },
  {
    step: '02',
    title: 'Let AI build the training',
    description:
      'Generate summaries, mind maps, infographics, narration, and role-specific learning paths automatically.',
  },
  {
    step: '03',
    title: 'Launch onboarding people actually complete',
    description:
      'Deliver missions, streaks, checkpoints, and manager visibility in a flow new hires keep moving through.',
  },
];

export const FEATURE_SPOTLIGHTS: readonly FeatureSpotlight[] = [
  {
    icon: 'lucideGamepad2',
    title: 'Make onboarding feel like progress, not homework',
    description:
      'Use XP, streaks, levels, and lightweight challenges to turn onboarding from a passive document dump into an active system. Teams reinforce knowledge while keeping momentum high through the first critical weeks.',
    ctaLabel: 'Get started free',
    ctaHref: '/login',
    reverse: false,
    visual: 'gamification',
  },
  {
    icon: 'lucideDatabase',
    title: 'Turn scattered internal knowledge into one learning layer',
    description:
      'RoleReady ingests code repositories, tickets, docs, and internal notes, then reshapes them into assets a new hire can actually use. The result is less manual enablement work and far better coverage of what matters.',
    ctaLabel: 'See integrations',
    ctaHref: '#integrations',
    reverse: true,
    visual: 'ingestion',
  },
  {
    icon: 'lucideBarChart3',
    title: 'Give managers signal instead of status meetings',
    description:
      'Track both content generation and learner progress with a manager view built for operational follow-through. You can see where people are blocked, what content is landing, and where additional coaching is needed.',
    ctaLabel: 'View pricing',
    ctaHref: '#pricing',
    reverse: false,
    visual: 'dashboard',
  },
];

export const WEEKDAY_STREAK: readonly StreakDay[] = [
  { label: 'Mon', completed: true },
  { label: 'Tue', completed: true },
  { label: 'Wed', completed: true },
  { label: 'Thu', completed: true },
  { label: 'Fri', completed: true },
  { label: 'Sat', completed: false },
  { label: 'Sun', completed: false },
];

export const LEADERBOARD_ENTRIES: readonly LeaderboardEntry[] = [
  { rank: 1, name: 'Emma Carter', xp: '3,200 XP', highlighted: false },
  { rank: 2, name: 'Noah Bennett', xp: '2,890 XP', highlighted: false },
  { rank: 3, name: 'You', xp: '2,450 XP', highlighted: true },
];

export const INGESTION_SOURCES: readonly IngestionSource[] = [
  { source: 'GitHub', assetCount: '247 files', statusLabel: 'Complete', tone: 'primary' },
  { source: 'Jira', assetCount: '89 issues', statusLabel: 'Complete', tone: 'primary' },
  {
    source: 'Confluence',
    assetCount: '34 pages',
    statusLabel: 'Processing',
    tone: 'accent',
  },
  { source: 'Documents', assetCount: '12 PDFs', statusLabel: 'Queued', tone: 'muted' },
];

export const DASHBOARD_STATS: readonly DashboardStat[] = [
  { label: 'Completion rate', value: '92%' },
  { label: 'Active learners', value: '24' },
  { label: 'Average score', value: '87' },
];

export const TEAM_PROGRESS: readonly TeamProgress[] = [
  { team: 'Engineering', progress: 88 },
  { team: 'Product', progress: 75 },
  { team: 'Design', progress: 95 },
  { team: 'Marketing', progress: 62 },
];

export const PLATFORM_FEATURES: readonly PlatformFeature[] = [
  {
    icon: 'lucideGamepad2',
    title: 'Gamified onboarding',
    description: 'XP, levels, streaks, and leaderboards that keep new hires engaged from day one.',
  },
  {
    icon: 'lucideBrain',
    title: 'AI content generation',
    description:
      'Automatically produce summaries, mind maps, and learning assets from live company knowledge.',
  },
  {
    icon: 'lucideDatabase',
    title: 'Multi-source ingestion',
    description:
      'Sync repositories, ticket systems, docs, and wikis without building a new manual process.',
  },
  {
    icon: 'lucideHeadphones',
    title: 'Audio narration',
    description:
      'Turn generated content into listenable learning for commutes, async review, and reinforcement.',
  },
  {
    icon: 'lucideBarChart3',
    title: 'Real-time progress',
    description:
      'Watch generation jobs and learner progress update continuously instead of chasing status manually.',
  },
  {
    icon: 'lucideShield',
    title: 'Enterprise controls',
    description:
      'Keep access scoped by organization and role so knowledge stays visible to the right people only.',
  },
  {
    icon: 'lucideZap',
    title: 'Fast pipelines',
    description:
      'Process large source sets quickly and let the system handle the heavy lifting in the background.',
  },
  {
    icon: 'lucideGlobe',
    title: 'Custom prompts',
    description:
      'Override prompts at the project level to tailor generated output to your industry and workflow.',
  },
];

export const OUTCOME_STATS: readonly OutcomeStat[] = [
  { value: '85%', label: 'shorter onboarding timelines' },
  { value: '3.5x', label: 'stronger knowledge retention' },
  { value: '< 5 min', label: 'to generate new learning assets' },
  { value: '92%', label: 'program completion rate' },
];

export const TESTIMONIALS: readonly Testimonial[] = [
  {
    name: 'Emma Carter',
    role: 'CTO, developer tools startup',
    quote:
      'What used to take three weeks now takes five days. We connected the tools we already use, and RoleReady turned them into training without asking managers to build another manual program.',
  },
  {
    name: 'Priya Shah',
    role: 'People Operations Director, B2B SaaS',
    quote:
      'The mission-based learning flow changed the tone immediately. Completion rates moved from 40% to 92% because people actually wanted to keep going.',
  },
  {
    name: 'Marcus Reed',
    role: 'Engineering Manager, fintech platform',
    quote:
      'Tickets and architecture docs becoming guided summaries and maps was the unlock. New engineers now understand how the system fits together much earlier in their ramp.',
  },
];

export const PRICING_PLANS: readonly PricingPlan[] = [
  {
    name: 'Starter',
    price: '$0',
    period: '/mo',
    description: 'A lightweight entry point for small teams validating the workflow.',
    features: [
      '1 project',
      'Up to 5 seats',
      '10 AI-generated assets per month',
      'Summaries and mind maps',
      'Email support',
    ],
    ctaLabel: 'Get started free',
    featured: false,
  },
  {
    name: 'Pro',
    price: '$99',
    period: '/mo',
    description:
      'The full operating system for growing teams that want structured onboarding at scale.',
    features: [
      'Unlimited projects',
      'Up to 50 seats',
      'Unlimited AI-generated assets',
      'All content formats included',
      'Audio narration',
      'Gamification features',
      'Real-time dashboards',
      'Priority support',
    ],
    ctaLabel: 'Start free trial',
    featured: true,
  },
  {
    name: 'Enterprise',
    price: 'Contact us',
    period: '',
    description:
      'Custom deployment and support for large organizations with stricter requirements.',
    features: [
      'Everything in Pro',
      'Unlimited seats',
      'SSO and SAML support',
      'Dedicated environment and SLA',
      'Custom integrations',
      'Onboarding program design support',
      'Named customer success partner',
    ],
    ctaLabel: 'Talk to sales',
    featured: false,
  },
];

export const FOOTER_LINKS: readonly FooterLink[] = [
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'Integrations', href: '#integrations' },
];
