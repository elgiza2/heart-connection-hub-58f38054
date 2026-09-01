# Theming & design tokens

Single source of truth for colors. Change values here — never hardcode
`#fff`, `rgba(255,255,255,…)` or `text-white` in components.

## Where things live

| File | Role |
| --- | --- |
| `src/lib/theme.ts` | The only theme controller. `light \| dark \| system`, stored in `localStorage["megsy_theme"]`. Auth routes are always dark. |
| `index.html` (pre-paint script) | Applies the stored theme before React renders (no flash). |
| `src/index.css` → `@layer base` | The semantic token sets: `:root` = light, `.dark, [data-theme="dark"]` = dark. |
| `src/styles/megsy-tokens.css` | Settings (`--mn-*`) tokens; all derived from the semantic tokens. |
| `src/styles/light-theme.css` | Remaps for legacy dark-first CSS when `html[data-theme="light"]`. |
| `src/hooks/useThemeMode.ts` | `useThemeMode()` / `useIsDark()` for React components that need the resolved theme. |

## Token layers

1. **Semantic (HSL triplets, use with `hsl(var(--x))` or Tailwind classes)**
   `--background --foreground --card --popover --primary --secondary
    --muted --accent --destructive --border --input --ring`
2. **Surface / ink shortcuts (flip per theme, safe in raw CSS)**
   - `--sf-1 / --sf-2 / --sf-3` — surfaces (white → near-black in dark)
   - `--ink-1 / --ink-2 / --ink-3` — text (near-black → white in dark)
   - `--hairline` — subtle border
3. **Feature tokens** — `--mn-*` (settings), `--chat-*` (chat), `--claude-*`
   (desktop chat skin). These must always resolve to layer 1 or 2.

## Rules

- Text color: `text-foreground` / `text-muted-foreground`, or `var(--ink-1)` in raw CSS.
- Surfaces: `bg-background` / `bg-card`, or `var(--sf-1)`.
- Never pair `--sf-*` with text (that inverts in light mode) — use `--ink-*`.
- Themed dark-only CSS must be scoped: `html.dark …` or `html[data-theme="dark"] …`.
- Minimum contrast: 4.5:1 body text, 3:1 for ≥24px text.
- Auth screens (`/auth`, `/login`, …) intentionally stay dark; do not theme them.

## Verifying

Audit script: `/tmp/browser/audit/audit.py <light|dark> <width> <tag>` —
logs in, walks the main routes, screenshots them, and reports every text node
below the contrast threshold.
