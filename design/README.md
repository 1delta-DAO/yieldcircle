# @yieldcircle/design

The one design both front ends wear: the app (`src/`) and the landing page
(`landing/`). A pnpm workspace package, linked by `workspace:*`.

```ts
import '@yieldcircle/design/index.css'               // once, first, in each entry's main.tsx
import { Logo, Mark, Socials, TELEGRAM_URL } from '@yieldcircle/design'
```

| file | what |
|---|---|
| `tokens.css` | the palette, type, radius, gutter — `:root` custom properties |
| `base.css` | element reset, page ground, focus rings, scrollbars, one-word utilities (`.mono .t70 .ok .lbl .sp .hide` …) |
| `components.css` | primitives both render: `.btn`, `.modal` + `.scrim`, the wallet sheet (`.wl-*`), avatars (`.chr`), `.logo`, the community links |
| `marketing.css` | the lander's look: gradient headline, the field of farmers (`.join-*`), the landing page (`.lp-*`) |
| `Logo.tsx`, `Socials.tsx` | the logo lockup and mark, the Telegram / X links |
| `brand/` | the brand as plain data, no React: mark paths (`brand.generated.ts`, written by `pnpm brand`) and the community links — the gate overlay (`gate/page.ts`) imports this |

## Rules

- **Colours, fonts and radii are tokens.** Read `var(--…)`; a new literal colour
  in either front end is a token missing here.
- **A rule lives here when both front ends render it** — its selector is made
  only of shared classes. Scoped under an app surface (`.ticket .btn`), it stays
  in `src/styles/app.css`, which loads after this package and builds on it.
- **Order is part of the API.** `index.css` imports tokens → base → components
  → marketing; the app's stylesheet comes last. Moving a rule between files can
  flip which of two equal-specificity rules wins — check the computed styles
  (not a screenshot) on the app and the landing when you do.
