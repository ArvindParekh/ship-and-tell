# AGENTS.md

Guidelines for AI coding agents working in the **ship-and-tell** repository.

## Project Overview

Next.js 16 web application using React 19, TypeScript 5, and Tailwind CSS 4.
Uses the App Router (`src/app/`) with pnpm as the package manager.

A GitHub webhook listener that spawns 5 parallel Subconscious research agents
when a PR merges, synthesizes their output into a blog post, Twitter thread,
and HN post, then auto-publishes to dev.to and notifies Slack.

## Directory Structure

```
src/
  app/                          # Next.js App Router
    page.tsx                    # Dashboard -- lists runs, has Simulate Merge button
    layout.tsx                  # Root layout (fonts, metadata)
    globals.css                 # Global styles, Tailwind import, CSS custom properties
    run/[id]/page.tsx           # Live run view -- the demo screen
    api/
      webhook/github/route.ts  # GitHub webhook handler
      trigger/route.ts         # Manual trigger (POST) -- demo fallback
      run/[id]/status/route.ts # Polling endpoint for live dashboard
  lib/
    types.ts                   # All TypeScript types
    runs.ts                    # In-memory run store (global Map)
    agents.ts                  # 5 agent definitions + synthesizer
    pipeline.ts                # processRun -- shared by webhook and trigger routes
    github.ts                  # GitHub diff fetcher
    devto.ts                   # dev.to publisher
    slack.ts                   # Slack notifier
  components/
    simulate-merge-button.tsx  # Client component for manual trigger
public/                        # Static assets
```

## Build / Dev / Lint Commands

All commands use **pnpm**. Do not use npm or yarn.

| Command            | Purpose                                   |
|--------------------|-------------------------------------------|
| `pnpm install`     | Install dependencies                      |
| `pnpm dev`         | Start dev server (hot reload)             |
| `pnpm build`       | Production build (also runs type checks)  |
| `pnpm start`       | Start production server                   |
| `pnpm lint`        | Run ESLint across the project             |

### Type Checking

`pnpm build` runs the TypeScript compiler as part of the Next.js build. For
standalone type checking without a full build:

```sh
pnpm tsc --noEmit
```

### Linting a Single File

```sh
pnpm eslint src/app/page.tsx
```

### Testing

No test framework is currently configured. If you add one, prefer **Vitest** for
unit/integration tests and **Playwright** for E2E tests. Follow this convention:

- Co-locate unit tests next to source files as `*.test.ts` / `*.test.tsx`
- Place E2E tests in a top-level `e2e/` directory
- Run a single test: `pnpm vitest run src/app/page.test.tsx`
- Run all tests: `pnpm vitest run`

## TypeScript Configuration

- **Strict mode is ON** (`strict: true` in `tsconfig.json`) -- do not weaken it.
- Target: ES2017, module: ESNext, module resolution: bundler.
- Path alias: `@/*` maps to `./src/*`. Always use `@/` for project imports.
- `noEmit: true` -- Next.js handles compilation; TypeScript is for type checking only.

## Code Style

### Formatting

- **2-space indentation** (spaces, not tabs).
- **Double quotes** for all strings (imports, JSX attributes, etc.).
- **Semicolons** at end of statements.
- No Prettier is configured; follow the existing formatting conventions manually.

### Imports

Order imports in this sequence, separated by blank lines:

1. React / Next.js built-ins (`react`, `next/*`)
2. Third-party packages (`subconscious`, `uuid`)
3. Project aliases (`@/lib/*`, `@/components/*`)
4. Relative imports (`./`, `../`)
5. Side-effect imports (CSS)

```typescript
import type { Metadata } from "next";
import { Subconscious } from "subconscious";

import { createRun } from "@/lib/runs";
import type { Run } from "@/lib/types";

import "./globals.css";
```

- Use `import type { ... }` for type-only imports (enforced by TypeScript `isolatedModules`).
- Use named imports unless the module exports a default (e.g., `Image` from `next/image`).

### Naming Conventions

| Entity              | Convention    | Example                        |
|---------------------|---------------|--------------------------------|
| React components    | PascalCase    | `DashboardPage`, `RunPage`     |
| Functions / vars    | camelCase     | `processRun`, `handleClick`    |
| CSS custom props    | kebab-case    | `--font-geist-sans`            |
| Files (components)  | kebab-case    | `simulate-merge-button.tsx`    |
| Files (routes)      | Next.js names | `page.tsx`, `layout.tsx`       |
| Files (lib)         | kebab-case    | `pipeline.ts`, `devto.ts`     |
| Types / Interfaces  | PascalCase    | `AgentResult`, `Run`           |
| Constants           | UPPER_SNAKE_CASE or camelCase for config objects |

### Component Patterns

- Use **function declarations** with `export default` for page and layout components.
- Type component props inline with `Readonly<{ ... }>` for layouts.
- For reusable components, define a named `Props` type and export as named export.
- Only add `"use client"` when the component genuinely needs client-side interactivity
  (useState, useEffect, event handlers). Default to server components.

### Styling

- Use **Tailwind CSS 4** utility classes exclusively. No CSS modules or styled-components.
- Tailwind is configured via CSS-first approach in `globals.css` (`@import "tailwindcss"`
  and `@theme inline`).
- Dark mode: use `dark:` variant classes and CSS custom properties with
  `prefers-color-scheme` media query.
- Custom theme tokens go in `globals.css` under `@theme inline`.

### Error Handling

- Use Next.js error boundaries: create `error.tsx` in route segments for runtime errors.
- In API routes, use try/catch and return typed error responses with appropriate status codes.
- Never silently swallow errors. Always log with `console.error` or surface them.
- The pipeline (`lib/pipeline.ts`) catches agent and synthesizer failures individually
  so one agent error doesn't block the rest.

## Environment Variables

```env
SUBCONSCIOUS_API_KEY=        # From subconscious.dev dashboard
DEVTO_API_KEY=               # From dev.to Settings > Account > API Keys
SLACK_WEBHOOK_URL=           # From Slack App > Incoming Webhooks
GITHUB_WEBHOOK_SECRET=       # Random string, set same value in GitHub webhook settings
NEXT_PUBLIC_BASE_URL=        # http://localhost:3000 in dev, ngrok URL for demo
```

- `.env` files are gitignored. Never commit secrets.
- Server-only vars have no prefix. Client-side vars must use `NEXT_PUBLIC_`.

## Key Dependencies

| Package        | Version | Purpose                            |
|----------------|---------|------------------------------------|
| next           | 16.1.6  | Framework (App Router)             |
| react          | 19.2.3  | UI library                         |
| subconscious   | 0.3.1   | Subconscious agent SDK             |
| uuid           | 13.0.0  | Run ID generation                  |
| tailwindcss    | ^4      | Utility-first CSS                  |
| typescript     | ^5      | Type checking                      |
| eslint         | ^9      | Linting (flat config)              |

## Architecture Notes

- **`lib/pipeline.ts`** contains `processRun()` -- the core orchestration function.
  Both the webhook route and the manual trigger route import it. Do not duplicate.
- **In-memory state** (`lib/runs.ts`): a global `Map<string, Run>`. No database.
  State resets on server restart.
- **Subconscious SDK**: import `{ Subconscious }` (named export, not default).
  Platform tools require `{ type: "platform", id: "...", options: {} }`.
- **Next.js 16 async params**: route params are `Promise<{ id: string }>` and must
  be awaited in both server and client components.

## Common Pitfalls

- Do not import from `next/router` -- use `next/navigation` with App Router.
- Tailwind CSS 4 does NOT use `tailwind.config.js`. Theme customization goes in
  `globals.css` under `@theme inline`.
- The path alias `@/*` resolves to `src/*`. Do not use bare relative paths.
- `pnpm build` is the definitive check before pushing -- it runs both type checking
  and the production build.
- The Subconscious SDK exports `Subconscious` as a named export, not default.
