# Spartan UI

Spartan is the Angular port of shadcn/ui. It gives us a design system built on two layers:

- **Brain** (`@spartan-ng/brain`) — headless behavior: accessibility, keyboard navigation, overlays, etc. Installed as an npm package.
- **Helm** (`libs/ui/`) — Tailwind CSS styling. Code we own and can customize freely.

You never install Helm as a package. Instead, the CLI copies component source code into your project so you have full control over the styling.

---

## Project structure

```
libs/ui/
├── utils/src/lib/hlm.ts        # classes() and hlm() utilities
├── button/src/
│   ├── index.ts                 # re-exports + HlmButtonImports
│   └── lib/
│       ├── hlm-button.ts        # HlmButton directive
│       └── hlm-button.token.ts  # button config injection token
└── card/src/
    ├── index.ts                 # re-exports + HlmCardImports
    └── lib/
        ├── hlm-card.ts
        ├── hlm-card-header.ts
        ├── hlm-card-title.ts
        ├── hlm-card-description.ts
        ├── hlm-card-content.ts
        ├── hlm-card-footer.ts
        └── hlm-card-action.ts
```

The CLI manages `tsconfig.json` path aliases automatically. Each component gets an entry like:

```json
"@app/ui/button": ["./libs/ui/button/src/index.ts"]
```

---

## Adding a new component

Use the Spartan CLI. That's it.

```bash
npx ng g @spartan-ng/cli:ui <component-name>
```

For example, to add a dialog:

```bash
npx ng g @spartan-ng/cli:ui dialog
```

The CLI will:
1. Generate Helm directive files into `libs/ui/dialog/src/`
2. Add a `@app/ui/dialog` path alias to `tsconfig.json`
3. Skip utils if it's already installed

You can then import and use it immediately:

```typescript
import { HlmDialogImports } from '@app/ui/dialog';
```

### Available components

Run the CLI without a name to see the full list, or check the [official docs](https://www.spartan.ng/components). Here are some commonly needed ones:

| Component | CLI name | Example |
|-----------|----------|---------|
| Alert Dialog | `alert-dialog` | Confirmation modals |
| Avatar | `avatar` | User profile images |
| Badge | `badge` | Status indicators |
| Checkbox | `checkbox` | Form checkboxes |
| Dialog | `dialog` | Modal windows |
| Dropdown Menu | `dropdown-menu` | Action menus |
| Input | `input` | Text fields |
| Label | `label` | Form labels |
| Select | `select` | Dropdown selects |
| Separator | `separator` | Visual dividers |
| Sheet | `sheet` | Slide-out panels |
| Skeleton | `skeleton` | Loading placeholders |
| Spinner | `spinner` | Loading indicators |
| Switch | `switch` | Toggle controls |
| Table | `table` | Data tables |
| Tabs | `tabs` | Tab navigation |
| Tooltip | `tooltip` | Hover hints |

### CLI configuration

The CLI reads from `components.json` at the project root:

```json
{
  "directory": "libs/ui",
  "importAlias": "@app/ui"
}
```

- `directory` — where generated files go
- `importAlias` — the TypeScript path prefix used in imports

---

## Using components

### Button

```typescript
import { HlmButtonImports } from '@app/ui/button';

@Component({
  imports: [HlmButtonImports],
})
```

```html
<!-- Default (primary) -->
<button hlmBtn>Save</button>

<!-- Variants -->
<button hlmBtn variant="outline">Cancel</button>
<button hlmBtn variant="destructive">Delete</button>
<button hlmBtn variant="secondary">Secondary</button>
<button hlmBtn variant="ghost">Ghost</button>
<button hlmBtn variant="link">Link</button>

<!-- Sizes -->
<button hlmBtn size="sm">Small</button>
<button hlmBtn size="lg">Large</button>
<button hlmBtn size="icon">+</button>

<!-- As a link -->
<a hlmBtn routerLink="/dashboard">Dashboard</a>

<!-- Disabled -->
<button hlmBtn [disabled]="true">Disabled</button>

<!-- Extra Tailwind classes (merged automatically) -->
<button hlmBtn class="w-full">Full Width</button>
```

**Variants:** `default` | `destructive` | `outline` | `secondary` | `ghost` | `link`

**Sizes:** `default` (h-9) | `xs` (h-6) | `sm` (h-8) | `lg` (h-10) | `icon` (9x9) | `icon-xs` | `icon-sm` | `icon-lg`

### Card

```typescript
import { HlmCardImports } from '@app/ui/card';

@Component({
  imports: [HlmCardImports],
})
```

```html
<section hlmCard>
  <header hlmCardHeader>
    <h2 hlmCardTitle>Card Title</h2>
    <p hlmCardDescription>Some helpful context.</p>
  </header>
  <div hlmCardContent>
    <!-- your content -->
  </div>
  <footer hlmCardFooter>
    <button hlmBtn>Save</button>
  </footer>
</section>
```

Use `size="sm"` on `hlmCard` for a compact variant. Use `hlmCardAction` inside a header to place a top-right action button.

---

## Theme system

### Color tokens

All colors are CSS custom properties using oklch, defined in `src/styles.css`:

| Token | Purpose |
|-------|---------|
| `--background` / `--foreground` | Page background and text |
| `--card` / `--card-foreground` | Card surfaces |
| `--primary` / `--primary-foreground` | Primary actions (buttons, links) |
| `--secondary` / `--secondary-foreground` | Secondary actions |
| `--muted` / `--muted-foreground` | Subdued text, placeholders |
| `--accent` / `--accent-foreground` | Hover states, highlights |
| `--destructive` | Danger/error color |
| `--border` | Default border color |
| `--input` | Input field borders |
| `--ring` | Focus ring color |
| `--radius` | Base border-radius |
| `--sidebar-*` | Sidebar-specific tokens |

### Dark mode

`ThemeService` (in `src/app/services/theme.service.ts`) handles dark mode with three options: `light`, `dark`, and `system`.

```typescript
import { ThemeService } from '../services/theme.service';

private readonly themeService = inject(ThemeService);

// Toggle between light and dark
this.themeService.toggleMode();

// Set explicitly
this.themeService.setDarkMode('dark');
this.themeService.setDarkMode('light');
this.themeService.setDarkMode('system'); // follows OS preference
```

How it works:
- Adds/removes the `dark` class on `<html>`
- In `system` mode, listens to the `prefers-color-scheme` media query
- Persists the user's choice in `localStorage`

### Switching base themes

The current theme is **neutral** (pure monochrome). To switch, replace the CSS variables in `src/styles.css` under `:root` and `:root.dark`. Reference values for all themes live in:

```
.claude/ref/spartan/libs/cli/src/generators/theme/libs/colors.ts
```

Available base themes: **neutral** | **stone** | **zinc** | **gray** | **slate**

---

## Utilities

### `classes()`

Used inside Helm directives to dynamically apply classes to the host element. Reacts to Angular signals, auto-merges with external `class` attributes via `tailwind-merge`.

```typescript
import { classes } from '@app/ui/utils';

@Directive({ selector: '[myDirective]' })
export class MyDirective {
  constructor() {
    classes(() => 'bg-primary text-primary-foreground rounded-md');
  }
}
```

### `hlm()`

Static class string merging. Combines `clsx` (conditional classes) with `tailwind-merge` (conflict resolution).

```typescript
import { hlm } from '@app/ui/utils';

const cls = hlm('bg-primary', isActive && 'ring-2', 'rounded-md');
```
