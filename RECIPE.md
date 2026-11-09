# Quota status bar

A Herdr mod that replaces the app's status bar with a quota strip:
one chip per live provider for its 5-hour window, and a hover card with the
refill time, quota-axi's run-out projection, the balance at reset, a pace
tick, and the provider's weekly and monthly windows. It is a fork of
Herdr's shipped `workspace-status`, so the machine, branch, agent count and
palette hint stay.

## The row

28 px tall, on the `chrome` colour with a 1 px `border` top edge, 14 px side
padding and 16 px gaps, base text 11.8 px in `muted`. Left to right:
machine icon and name, branch and its icon when the space has one, a
6 px `dim` dot with `N agents` (plus `· N needs you` in `blocked`), a 1 px
`border` divider, the quota chips (flex 1, clipped), then the palette hint
in `dim` on the right. The hint names the key actually bound to
`app.palette`.

## Chips

Flex none, 19 px tall, 6 px horizontal padding, 4 px gap, 5 px radius,
clipped:

- A `surface` background at 50 % opacity, then the same box filled from the
  left to the remaining percentage in the pace tone at 30 % opacity.
- Text: an 11 px provider icon (Herdr's own `icons/…` where it has one,
  otherwise this mod's `icons/`), a three-letter code in `muted` from a
  provider→label map (`CLA`, `ZAI`, `OCG`, `CMD`), falling back to the
  first three letters uppercased, the percentage in the pace tone, then
  `· 4h 52m` in `dim` when the window has a reset time. Icons are
  `image()` so brand colours survive, except single-colour marks — cursor,
  copilot, grok, gemini, opencode, opencode-go, commandcode, muse — which
  use `svg()` tinted `muted`. Pace tone:
  `blocked` when quota-axi's window pace is `ahead` (spending runs ahead of
  the clock, so the window empties before it refills), `done` for
  `on_pace` and `behind`, `muted` when pace is unknown. The fill width is
  the amount left; only the colour is about pace.
- The chip colour is **provider-wide**: red if any non-model window
  (`session`, `weekly`, `monthly`, `rolling`) is `ahead`, or the scope's
  runway is `projected_exhaustion` / `exhausted_now`; green when at least
  one window has a pace and none is ahead; grey when none has one. This is
  the Command Code case: its 5-hour is comfortable while the weekly is
  running hot.
- Click opens the Quota pane as a tab (`run("tab.new", { name: "Quota",
  mod: "quota" })`); the trailing `+N` chip does the same and has a
  "N more providers" tooltip.
- Up to ten chips. Count what fits from the row's leftover width, using an
  estimate per chip (70 px + about 20 px for the code + 54 px with a
  reset + 15 px with an icon), leaving 28 px for `+N`.

**Which window.** The provider's 5-hour window: `kind === "session"`, an id
of `rolling` (OpenCode Go's plan-declared 5-hour cap), or an id/label
matching `5h` / `five_hour`. If several match (agy reports Gemini's and
Claude/GPT's), take the emptiest. A provider with none falls back to its
tightest window; if that has no percentage either (credits-only), leave it
out. Sort chips by the displayed percentage ascending. When the window has
no reset time (Claude's 5-hour bucket before its first request), show no
time; never borrow another window's reset.

## Hover card

A `HoverCard` from `gpui-base`: trigger is the chip, content is a
transparent `v_flex` with 20 px bottom padding wrapping the panel, so the
panel sits 20 px above the bar and the gap stays inside the hover region.
Open delay 90 ms, close delay 60 ms. Panel: 262 px wide, 12 px padding,
7 px gaps, `popover` background, 1 px `border`, 10 px radius.

Top to bottom:

1. Name in 13 px semibold `foreground`, a 16 px refresh button, plan in
   11 px `dim`, the big percentage in 13 px semibold, in that window's own
   pace tone. The refresh button reads again with `--max-age 0`, swaps to
   Herdr's spinner while a read runs, and queues a second read if pressed
   during one.
2. `<window label> window` in 11 px `muted`.
3. A 5 px `surface` bar with the remaining percentage filled in the pace
   tone; no clipping, so the pace tick can stand proud.
4. `5-hour refill in 4h 52m · 01:39` (or `reset in …` for a fallback
   window) in 11.5 px `muted`.
5. The projection in 11.5 px — `ansi3` when it runs out, else `muted`:
   - `runs out in ~2h 33m · 23:22 · early estimate` (from the scope's
     runway; name the limiting window after the time when it is not the
     chip's window),
   - `lasts to reset`,
   - `empty now`.
6. `~85 % over at reset` / `~87 % left at reset` in 11.5 px, computed as
   `100 − 100 × burnMultiple` from the displayed window's pace; skip when
   the burn is 0 or the window is empty.
7. A 1 px `border` divider, then up to three other windows (`kind !==
   "session"`, weekly first): label in 10.5 px `dim`, percentage in 11.5 px
   and its 4 px bar in that window's own pace tone (`blocked` when `ahead`,
   `done` when `on_pace`/`behind`, `muted` when unknown) on the right,
   `· resets in 6d 10h` in 10.5 px `dim`.
8. When the provider reports a credit balance (`credits`), a
   `monthly credits` row (or `balance` for a USD balance) with the
   remaining amount on the right, in 10.5 / 11.5 px. Command Code is the
   case here: its monthly window comes from the plan's included credit
   pool, while this row keeps the absolute balance (including purchased
   and free credits).
9. No footer text; the chip is the click target.

## Pace tick

On the card's bars only: a 2 px wide vertical `foreground` line at 50 %
opacity, inset −3 px top and bottom (it stands proud of the bar), rounded
1 px, positioned with a percentage `left`.

- Mark = `percentRemaining − reservePercentPoints`, clamped to 0–99.
  quota-axi publishes `reservePercentPoints = percentRemaining −
  timeRemainingPercent`, so subtracting it recovers the fraction of the
  window still on the clock — where the bar would reach at an even burn
  when the bar shows what is left.
- A tick left of the fill's end means under pace (the fill reaches further
  than the clock); right means burning faster than the clock. No pace data
  (stale or unmeasured), no tick.

## Data

Poll `quota-axi --json --no-credential-refresh --max-age 4m` every five
minutes (`cx.timer.every`), and recount every minute without re-reading.
The card's refresh button polls with `--max-age 0` and queues a press made
during an in-flight read. Resolve `quota-axi` by trying `PATH` first, then
`~/.local/share/mise/shims/quota-axi`, `~/.local/bin/quota-axi`,
`/opt/homebrew/bin/quota-axi`, `/usr/local/bin/quota-axi`; only a failure
to start moves to the next candidate.

Command Code's monthly window comes from the
[quota-axi fork](https://github.com/AshMcConnell/quota-axi): it reads
`/alpha/billing/subscriptions` for the plan and period, and
`/alpha/usage/summary` for monthly credits spent. Spent plus remaining is
the plan pool, so the percentage needs no plan table; a small table is a
fallback for a failed summary read. Stock quota-axi 0.1.69 omits this
window and misses the nested credit balance.

`quota-model.js` is a copy of herdr-quota's `mods/quota/model.js` (pure:
`summarize`, `remainingTone`, `formatReset`), because Herdr mods cannot
import each other's folders. The mod adds `formatSpan` (seconds to
`2h 33m`), `clockText` (local `23:22`, weekday when not today) and
`paceMark`.

## Files

```text
mods/status-quota/
  main.js          the View: fetch, session window, chips, card, projection
  quota-model.js   copied from herdr-quota (MIT)
  mod.json         { "place": "none", "cloned_from": … }
  icons/           provider marks Herdr does not ship (CC0, see icons/LICENSE)
```

The [quota-axi fork](https://github.com/AshMcConnell/quota-axi) is external:
install it on `PATH` from its checkout (`pnpm build && npm link`).

`jsconfig.json` and `gpui-kit.d.ts` are written by the app; both are
ignored here.

## Layout

The mod never docks itself. A layout's status block must name it:

```json
{ "id": "status", "type": "block", "content": { "mod": "status-quota" }, "size": { "px": 28 } }
```

## Watch out

- `herdr-app check mods/status-quota` proves load and first render only
  (the loading state); prove a real read by looking at the bar. A fixture
  copy with a seeded `this.view` is the way to see chips and the card under
  `check`.
- The app's `exec` PATH can miss version managers (mise); the candidate
  list covers common installs, an exotic one needs its path added.
- `w("77%")` and percentage `left` need the parent laid out; before the
  first measure the chip count assumes full width.
- quota-axi's JSON is schemaVersion 5; unknown statuses read as
  unavailable, and a new major schema needs a model refresh in both this
  mod and herdr-quota.
- Clicking a chip calls `tab.new` with the `quota` mod; without
  herdr-quota installed the click is inert.

## Done when

- `herdr-app check mods/status-quota` passes.
- The bar shows one chip per live provider, emptiest first, with the
  5-hour percentage and refill time; hovering opens the card with the
  refill, projection and weekly row.
- A signed-out provider is absent; a failing quota-axi shows one red
  `quota read failed` chip with the error on hover.
- The pace tick sits left of the fill when the burn is faster than the
  clock, right when slower.
