# herdr-quota status bar

[quota-axi](https://github.com/kunchenguid/quota-axi)'s 5-hour windows as
chips in a [Herdr](https://herdr.dev) status bar, with a hover card for the
rest of the numbers.

Each chip is one live provider: its name, the percentage left in its 5-hour
window, and the time until that window refills, on a track that fills with
what is left. Hovering opens a card with the refill clock, quota-axi's
run-out projection, how much is left (or overspent) at reset, a pace tick
showing where an even burn would leave you, and the provider's weekly and
monthly windows. Clicking a chip opens the full Quota pane when
[herdr-quota](https://github.com/sjennings/herdr-quota) is installed.

The mod is a fork of Herdr's shipped `workspace-status`, so the machine,
branch, agent count and palette hint stay exactly where they were.

## Install

Needs Herdr (herdr-app) and quota-axi on `PATH` (`quota-axi --help` works).

Copy `mods/status-quota/` into `~/.config/herdr-app/mods/`, or ask your agent:

> Read ~/.config/herdr-app/AGENTS.md, then add this mod: herdr.dev/mods/AshMcConnell/herdr-quota-status

Then point the status block in the layout you use at it:

```json
{ "id": "status", "type": "block", "content": { "mod": "status-quota" }, "size": { "px": 28 } }
```

The mod never docks itself (`"place": "none"` in `mod.json`), so adding the
folder changes nothing until a layout names it. The Quota pane is optional:
without herdr-quota the chips still work, but clicking one does nothing.

## What it shows

- **Chips**, in the 28 px status row: name in `muted`, the percentage in
  `done` / `ansi3` / `blocked` (60 % and up / 30 % and up / below), then
  `· 4h 52m` in `dim` while that window has a reset time. The chip sits on a
  half-`surface` track filled from the left at 25 % opacity for what is
  left. Up to five fit, emptiest first; `+N` covers the rest.
- **Which window**: the provider's 5-hour window — a `session` one, or a
  `rolling` one for OpenCode Go's plan-declared cap. A provider with
  neither falls back to its tightest window.
- **Hover card**: name, plan and the big percentage; a bar; the refill
  countdown with its clock time; the run-out projection (`runs out in
  ~2h 33m · 23:22 · early estimate`, `lasts to reset`, or `empty now`);
  `~85 % over at reset` or `~87 % left at reset`; then up to three weekly
  and monthly windows, each with its own bar and reset.
- **Signed-out providers** are left out, since they have no percentage.
- **quota-axi missing or failing**: a single red `quota read failed` chip;
  hover shows the error.

## Pace tick

The card's bars carry a 2 px vertical tick: where the bar would end at an
even burn. quota-axi publishes `reservePercentPoints = percentRemaining −
timeRemainingPercent`, so the tick sits at `percentRemaining − reserve`,
clamped to 0–99.

- Tick left of the fill's end: burning faster than the clock.
- Tick right of it: under pace.
- Tick at the end: exactly on pace.

## Notes

- Reads quota only: `quota-axi --json --no-credential-refresh --max-age 4m`
  every five minutes, recounted every minute. It never mints, renews or
  delegates a credential. The card's **Refresh** lives in the Quota pane.
- `quota-model.js` is a copy of herdr-quota's `mods/quota/model.js`; Herdr
  mods cannot import each other, so keep the two in step.
- Uses `quota-axi` schemaVersion 5; unknown statuses read as unavailable.

## Built on

- Herdr's `workspace-status` mod (Apache License 2.0) — the status row this
  replaces.
- [herdr-quota](https://github.com/sjennings/herdr-quota) (MIT, © 2026
  sjennings) — `quota-model.js` and the pane the chips open.

MIT licensed; see [LICENSE](LICENSE) and [NOTICE](NOTICE).
