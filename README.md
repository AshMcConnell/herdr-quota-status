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

Needs Herdr (herdr-app) and the
[quota-axi fork](https://github.com/AshMcConnell/quota-axi) on `PATH`
(`quota-axi --help` works). Stock quota-axi 0.1.69 has no Command Code
monthly window, so install the fork:

```sh
git clone https://github.com/AshMcConnell/quota-axi
cd quota-axi && pnpm install && pnpm build && npm link
```

An update that reinstalls upstream quota-axi replaces the link; re-run
`npm link` from the fork afterwards.

Copy `mods/status-quota/` into `~/.config/herdr-app/mods/`, or ask your agent:

> Read ~/.config/herdr-app/AGENTS.md, then add this mod: herdr.dev/mods/AshMcConnell/herdr-quota-status

Keep the copied folder real: a symlink to this checkout outside
`~/.config/herdr-app` loads, but its icons fail to resolve and saves there
do not hot-reload.

Then point the status block in the layout you use at it:

```json
{ "id": "status", "type": "block", "content": { "mod": "status-quota" }, "size": { "px": 28 } }
```

The mod never docks itself (`"place": "none"` in `mod.json`), so adding the
folder changes nothing until a layout names it. The Quota pane is optional:
without herdr-quota the chips still work, but clicking one does nothing.

## What it shows

- **Chips**, in the 28 px status row: an 11 px provider icon and a
  three-letter code (`CLA`, `ZAI`, `OCG`) in `muted`, the percentage, then
  `· 4h 52m` in `dim` while that window has a reset time. Icons keep their
  brand colours where the provider has them; single-colour marks are
  tinted like the name. The chip's fill
  and percentage are coloured by whether the **provider** should last to
  its next reset: `blocked` when any window — 5-hour, weekly or monthly —
  is spending ahead of its clock, `done` when every measured window is on
  pace or behind, `muted` when no window has a pace reading. So a weekly
  running hot colours the chip even when the 5-hour window is comfortable.
  The fill still spans what is left, on a half-`surface` track. Up to ten
  fit, emptiest first; `+N` covers the rest.
- **Which window**: the provider's 5-hour window — a `session` one, or a
  `rolling` one for OpenCode Go's plan-declared cap. A provider with
  neither falls back to its tightest window.
- **Hover card**: name, a refresh button, plan and the big percentage; a bar;
  the refill countdown with its clock time; the run-out projection (`runs out
  in ~2h 33m · 23:22 · early estimate`, `lasts to reset`, or `empty now`);
  `~85 % over at reset` or `~87 % left at reset`; then up to three weekly
  and monthly windows, each with its own bar and reset. When the provider
  reports a credit balance (Command Code), a `monthly credits` row shows
  what is left. Cards follow the pointer between chips in under a tenth of
  a second.
- **Signed-out providers** are left out, since they have no percentage.
- **quota-axi missing or failing**: a single red `quota read failed` chip;
  hover shows the error.

## Pace tick

The card's bars carry a 2 px vertical tick: where the bar would end at an
even burn. quota-axi publishes `reservePercentPoints = percentRemaining −
timeRemainingPercent`, so the tick sits at `percentRemaining − reserve`,
clamped to 0–99.

- Tick left of the fill's end: under pace — the fill reaches further than
  the clock would.
- Tick right of it: burning faster than the clock.
- Tick at the end: exactly on pace.

## Notes

- Reads quota only: `quota-axi --json --no-credential-refresh --max-age 4m`
  every five minutes, recounted every minute. The card's **Refresh** button
  reads again right away (`--max-age 0`), so it never shows quota-axi's
  cached copy; a press during a read queues one behind it. It never mints,
  renews or delegates a credential. The Quota pane has its own refresh.
- `quota-model.js` is a copy of herdr-quota's `mods/quota/model.js`; Herdr
  mods cannot import each other, so keep the two in step.
- Command Code's monthly bar comes from quota-axi's `monthly` window.
  Use the [AshMcConnell/quota-axi fork](https://github.com/AshMcConnell/quota-axi):
  it reads the plan's subscription and usage summary. Stock quota-axi
  0.1.69 reports only its 5-hour and weekly windows and misses the nested
  credit balance.
- Uses `quota-axi` schemaVersion 5; unknown statuses read as unavailable.

## Built on

- Herdr's `workspace-status` mod (Apache License 2.0) — the status row this
  replaces.
- [herdr-quota](https://github.com/sjennings/herdr-quota) (MIT, © 2026
  sjennings) — `quota-model.js` and the pane the chips open.

MIT licensed; see [LICENSE](LICENSE) and [NOTICE](NOTICE).
