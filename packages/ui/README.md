# @bomatech/ui

Shared design tokens and base styles for the Bomatech frontend.

## Usage

In `apps/web/app/globals.css`:

```css
@import "@bomatech/ui/tokens.css";
@import "@bomatech/ui/app.css";
```

## Files

- `tokens.css` — CSS custom properties: colors (warm palette + violet accent), typography (Geist + Instrument Serif), spacing, radii, shadows, density modes, dark theme
- `app.css` — Base layout and components: sidebar, topbar, cards, KPI, tables, inputs, tags

## Design principles

- Warm off-white background (`--warm-50` to `--warm-900`)
- Single violet accent for actions and focus
- Density toggleable via `[data-density="compact"|"cozy"]`
- Dark theme via `[data-theme="dark"]`
