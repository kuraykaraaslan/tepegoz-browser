# @tepegoz/ui

The shared design-system package: a slim barrel of forked KUIreact atoms (`Button`, `Toggle`,
`Card`, `Modal`, `Input`, `Badge`, `AlertBanner`) plus first-party (non-fork) pieces — the brand
mark, the shared FontAwesome-backed icon surface, and an error boundary. Everything here is
presentational and owns no app state; components are added on demand as screens need them
(fork-on-demand), not pre-built as a full kit. Also exports the design tokens stylesheet
(`@tepegoz/ui/styles/tokens.css`) and a couple of small utilities (`cn`, `PolymorphicProps`) used
across the other chrome packages.

## Exports
- **`Button`**, **`Toggle`**, **`Card`**, **`Modal`**, **`Input`**, **`Badge`**, **`AlertBanner`**
  (+ `AlertAction` type) — forked KUIreact atoms; see `_FORK.md` for the fork policy.
- **`BrandMark`** — the app's brand/logo mark, used by `@tepegoz/browser-chrome`.
- **`Icon`** — the shared FontAwesome icon component, plus the `IconName` and `IconProps` types.
- **`ErrorBoundary`** — a first-party React error boundary.
- **`cn`** — the class-name merge helper (clsx + tailwind-merge) used throughout the chrome leaves.
- **`PolymorphicProps`** — a shared type for `as`-prop-style polymorphic components.

## Usage
```tsx
import { Button, Card, Icon, cn } from '@tepegoz/ui';

<Card title="Section">
  <Button onClick={() => save()}>
    <Icon name="check" className="h-4 w-4" />
    Save
  </Button>
</Card>
```

## Scripts
`pnpm typecheck` · `pnpm lint`
