import { View, div, svg } from "gpui-kit";
import { h_flex, v_flex, HoverCard } from "gpui-base";
import { spaces, agents, theme, run, window, keys, exec, home } from "herdr";
import { summarize, remainingTone, formatReset } from "./quota-model.js";

// The status bar, plus each provider's 5-hour window: a tinted chip whose
// fill tracks the percentage left, and a hover card with the refill time,
// quota-axi's run-out projection and the balance left at reset. Reads quota
// only: --no-credential-refresh keeps the poll from ever delegating a
// credential renewal to a vendor CLI.
const FETCH_MS = 5 * 60_000;
const TICK_MS = 60_000;
const MAX_AGE = "4m";
const MAX_CHIPS = 5;
const CARD_GAP = 20; // px of transparent space under the hover card

const SPAWN_FAILURE = /could not be started|not found|no such|cannot start|permission denied|ENOENT|EACCES/i;

// The app's PATH often lacks version managers (mise, Homebrew-only login
// shells), so try the usual install prefixes as well.
const QUOTA_AXI_CANDIDATES = () => [
  "quota-axi",
  `${home()}/.local/share/mise/shims/quota-axi`,
  `${home()}/.local/bin/quota-axi`,
  "/opt/homebrew/bin/quota-axi",
  "/usr/local/bin/quota-axi",
];

function stderrTail(stderr) {
  const lines = String(stderr ?? "").trim().split("\n");
  return lines[lines.length - 1] ?? "";
}

/** "45m", "2h 33m", "1d 4h" from a second count. */
function formatSpan(seconds) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) return "";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest ? `${hours}h ${rest}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const left = hours % 24;
  return left ? `${days}d ${left}h` : `${days}d`;
}

/** Local clock time ("23:22"), with the weekday when it is not today. */
function clockText(iso, now = Date.now()) {
  if (typeof iso !== "string" || iso === "") return "";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const hh = String(at.getHours()).padStart(2, "0");
  const mm = String(at.getMinutes()).padStart(2, "0");
  if (new Date(now).toDateString() === at.toDateString()) return `${hh}:${mm}`;
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][at.getDay()];
  return `${weekday} ${hh}:${mm}`;
}

export default class StatusQuota extends View {
  init(_props, cx) {
    this.now = Date.now();
    this.raw = null;
    this.view = null;
    this.state = { name: "loading" };
    this.fetching = false;
    this.leftover = 0;
    this.fetch(cx);
    cx.timer.every(FETCH_MS, (cx) => this.fetch(cx));
    cx.timer.every(TICK_MS, (cx) => {
      this.now = Date.now();
      if (this.raw) this.view = summarize(this.raw, this.now);
      cx.notify();
    });
  }

  fetch(cx) {
    if (this.fetching) return;
    this.fetching = true;
    cx.spawn(async (cx) => {
      let r = null;
      let failure = null;
      for (const bin of QUOTA_AXI_CANDIDATES()) {
        try {
          r = await exec(bin, ["--json", "--no-credential-refresh", "--max-age", MAX_AGE]);
          break;
        } catch (e) {
          const message = String(e?.message ?? e);
          if (!SPAWN_FAILURE.test(message)) {
            failure = message;
            break;
          }
        }
      }
      this.now = Date.now();
      try {
        if (r && r.code === 0) {
          this.raw = JSON.parse(r.stdout);
          this.view = summarize(this.raw, this.now);
          this.state = { name: "ready" };
        } else {
          this.state = {
            name: "error",
            message: r ? stderrTail(r.stderr) || `quota-axi exited ${r.code}` : failure ?? "quota-axi not installed",
          };
        }
      } catch (e) {
        this.state = { name: "error", message: `quota-axi output was not JSON: ${e?.message ?? e}` };
      }
      this.fetching = false;
      cx.notify();
    });
  }

  toneColor(t, tone) {
    return { ok: t.done, warn: t.ansi3, low: t.blocked }[tone] ?? t.muted;
  }

  /** Where the bar would reach at an even pace: the fraction of the window
   *  still left. quota-axi's reserve is percent remaining minus time
   *  remaining percent, so subtracting it puts the mark back on the clock.
   *  Null when the reading has no pace (stale or not measured). */
  paceMark(win) {
    const percent = win?.percentRemaining;
    const reserve = win?.pace?.reservePercentPoints;
    if (typeof percent !== "number" || typeof reserve !== "number") return null;
    const mark = percent - reserve;
    if (!Number.isFinite(mark)) return null;
    return Math.max(0, Math.min(99, mark));
  }

  /** The little vertical tick on a bar, drawn over the fill. */
  tick(t, mark, top, bottom) {
    return div().absolute().top(top).bottom(bottom).left(`${mark}%`).w(2)
      .rounded(1).bg(t.foreground).opacity(0.5);
  }

  openQuota() {
    run("tab.new", { name: "Quota", mod: "quota" });
  }

  /** The provider's 5-hour window, or null. Where there are two session
   *  windows (agy reports Gemini's and Claude/GPT's), the emptiest one.
   *  OpenCode Go's plan-declared 5-hour cap arrives as a `rolling` window
   *  rather than a `session` one. */
  sessionWindow(p) {
    const list = (p.windows ?? []).filter((w) =>
      w.kind === "session" ||
      w.id === "rolling" ||
      /5.?hour|five.?hour/i.test(`${w.id ?? ""} ${w.label ?? ""}`));
    if (!list.length) return null;
    return list.reduce((a, b) =>
      (b.percentRemaining ?? 101) < (a.percentRemaining ?? 101) ? b : a);
  }

  /** What one chip shows: the session window's percent and its refill.
   *  A provider with no session window falls back to its tightest window,
   *  so it still gets a number and a time. */
  chipData(p) {
    const win = this.sessionWindow(p);
    const fromSession = typeof win?.percentRemaining === "number";
    const percent = fromSession ? win.percentRemaining : p.tightest?.percent;
    if (typeof percent !== "number") return null;
    const soonest = (list) => list.map((w) => w.resetsAt).filter(Boolean).sort()[0];
    // A session window with no reset time (Claude's 5-hour bucket before its
    // first request) must not borrow another window's reset; only a provider
    // with no session window falls back to the limiting one.
    const at = fromSession ? win.resetsAt : soonest(p.tightest?.limiting ?? []);
    return {
      p,
      win,
      percent,
      label: (fromSession ? win.label : p.tightest?.label) || "quota",
      reset: at ? { at, session: fromSession } : null,
    };
  }

  /** quota-axi's projection for this provider: when the current pace runs
   *  it dry (the scope's runway), and how much of the window is left when
   *  it resets (100 minus the window's burn multiple, the same linear
   *  projection OpenUsage calls "left at reset"). */
  projection(p, win) {
    const runway = p.tightest?.runway;
    const out = { status: null, span: "", clock: "", window: "", early: false, leftAtReset: null };
    if (runway?.status === "projected_exhaustion" && runway.projectedExhaustedAt) {
      out.status = "exhaustion";
      out.span = formatSpan(runway.usableRunwaySeconds);
      out.clock = clockText(runway.projectedExhaustedAt, this.now);
      out.early = runway.projectionConfidence === "early";
      if (runway.limitingWindowId && runway.limitingWindowId !== win?.id) {
        out.window = (p.windows ?? []).find((w) => w.id === runway.limitingWindowId)?.label
          ?? runway.limitingWindowId;
      }
    } else if (runway?.status === "exhausted_now") {
      out.status = "empty";
    } else if (runway?.status === "through_reset") {
      out.status = "through";
    }
    const burn = win?.pace?.burnMultiple;
    if (out.status !== "empty" && typeof burn === "number" && burn > 0) {
      out.leftAtReset = Math.round(100 - burn * 100);
    }
    return out;
  }

  /** One provider: the 5-hour percent and refill on a tinted bar that
   *  fills with what is left, and a hover card with the projection. */
  chip(t, row) {
    const { p, percent, reset } = row;
    const tone = this.toneColor(t, remainingTone(percent));
    const when = reset ? formatReset(reset.at, this.now) : "";
    const fill = Math.max(0, Math.min(100, percent));
    const body = h_flex().id(`quota-${p.name}`).relative().flex_none().items_center()
      .h(19).px(6).gap(4).rounded(5).overflow_hidden().cursor_pointer()
      .on_click(() => this.openQuota())
      .child(div().absolute().inset_0().bg(t.surface).opacity(0.5))
      .child(div().absolute().top(0).bottom(0).left(0).w(`${fill}%`).bg(tone).opacity(0.25))
      .child(div().text_color(t.muted).child(p.name))
      .child(div().text_color(tone).child(`${percent}%`))
      .when(!!when, (el) => el.child(div().text_color(t.dim).child(`· ${when}`)));
    return HoverCard.new(`quota-card-${p.name}`).open_delay(220).close_delay(180)
      .trigger(body)
      .content(v_flex().pb(CARD_GAP).child(this.card(t, row)));
  }

  /** One of the provider's other windows (the weekly, a monthly bucket):
   *  its percentage, when it resets, and a bar. */
  windowRow(t, w) {
    const tone = this.toneColor(t, remainingTone(w.percentRemaining));
    const mark = this.paceMark(w);
    return v_flex().gap(3)
      .child(h_flex().gap(6).items_center()
        .child(div().text_size(10.5).text_color(t.dim).child(w.label ?? w.id))
        .child(div().flex_1())
        .child(div().text_size(11.5).text_color(tone).child(`${w.percentRemaining}%`))
        .when(!!w.resetsAt, (el) => el.child(div().text_size(10.5).text_color(t.dim)
          .child(`· resets in ${formatReset(w.resetsAt, this.now)}`))))
      .child(div().relative().h(4).rounded(2).bg(t.surface)
        .child(div().absolute().top(0).bottom(0).left(0).rounded(2).bg(tone)
          .w(`${Math.max(0, Math.min(100, w.percentRemaining))}%`))
        .when(mark !== null, (el) => el.child(this.tick(t, mark, -3, -3))));
  }

  /** The hover card: a bigger, styled panel with the numbers the one-line
   *  chip cannot hold. */
  card(t, row) {
    const { p, percent, label, reset } = row;
    const tone = this.toneColor(t, remainingTone(percent));
    const proj = this.projection(p, row.win);
    const when = reset ? formatReset(reset.at, this.now) : "";
    const resetClock = reset ? clockText(reset.at, this.now) : "";
    const fill = Math.max(0, Math.min(100, percent));
    const mark = this.paceMark(row.win);
    const others = (p.windows ?? [])
      .filter((w) => w.id !== row.win?.id && w.kind !== "session" && typeof w.percentRemaining === "number")
      .sort((a, b) => (a.kind === "weekly" ? 0 : 1) - (b.kind === "weekly" ? 0 : 1))
      .slice(0, 3);
    const projected = proj.status === "exhaustion"
      ? `runs out ${proj.span ? `in ~${proj.span}` : ""}${proj.clock ? ` · ${proj.clock}` : ""}${proj.window ? ` · ${proj.window}` : ""}${proj.early ? " · early estimate" : ""}`
      : proj.status === "empty" ? "empty now"
      : proj.status === "through" ? "lasts to reset"
      : "";
    return v_flex().w(262).p(12).gap(7).bg(t.popover).border_1().border_color(t.border).rounded(10)
      .child(h_flex().gap(6).items_center()
        .child(div().text_size(13).font_semibold().text_color(t.foreground).child(p.name))
        .when(!!p.plan, (el) => el.child(div().text_size(11).text_color(t.dim).child(p.plan)))
        .child(div().flex_1())
        .child(div().text_size(13).font_semibold().text_color(tone).child(`${percent}%`)))
      .child(div().text_size(11).text_color(t.muted).child(`${label} window`))
      .child(div().relative().h(5).rounded(3).bg(t.surface)
        .child(div().absolute().top(0).bottom(0).left(0).rounded(3).bg(tone).w(`${fill}%`))
        .when(mark !== null, (el) => el.child(this.tick(t, mark, -3, -3))))
      .when(!!when, (el) => el.child(div().text_size(11.5).text_color(t.muted)
        .child(`${reset.session ? "5-hour refill" : "reset"} in ${when}${resetClock ? ` · ${resetClock}` : ""}`)))
      .when(!!projected, (el) => el.child(div().text_size(11.5)
        .text_color(proj.status === "exhaustion" ? t.ansi3 : t.muted).child(projected)))
      .when(proj.leftAtReset !== null, (el) => el.child(div().text_size(11.5)
        .text_color(proj.leftAtReset >= 0 ? t.muted : t.ansi3)
        .child(proj.leftAtReset >= 0 ? `~${proj.leftAtReset}% left at reset` : `~${-proj.leftAtReset}% over at reset`)))
      .when(others.length > 0, (el) => el.child(div().h(1).bg(t.border)))
      .children(others.map((w) => this.windowRow(t, w)));
  }

  chips(t) {
    if (this.state.name === "loading") return [];
    if (this.state.name === "error" && !this.view) {
      return [
        h_flex().id("quota-error").flex_none().gap(4).items_center()
          .cursor_pointer().on_click(() => this.openQuota())
          .tooltip(this.state.message)
          .child(div().text_color(t.blocked).child("quota"))
          .child(div().text_color(t.dim).child("read failed")),
      ];
    }
    // A chip reads "claude 99% · 4h 54m": the 5-hour window and when it
    // refills, emptiest first. Count what fits, leaving room for a "+N";
    // widths are estimated at 11.8 px text.
    const rows = (this.view?.active ?? [])
      .map((p) => this.chipData(p))
      .filter(Boolean)
      .sort((a, b) => a.percent - b.percent || a.p.name.localeCompare(b.p.name));
    const chipWidth = (r) => 70 + r.p.name.length * 6.6 + (r.reset ? 54 : 0) + 12;
    const shown = [];
    let used = 0;
    for (const row of rows) {
      if (shown.length >= MAX_CHIPS) break;
      const w = chipWidth(row);
      if (this.leftover > 0 && used + w > this.leftover - 28) break;
      shown.push(row);
      used += w;
    }
    const chips = shown.map((row) => this.chip(t, row));
    const more = rows.length - shown.length;
    if (more > 0) {
      chips.push(div().flex_none().text_color(t.dim).cursor_pointer()
        .on_click(() => this.openQuota())
        .tooltip(`${more} more provider${more === 1 ? "" : "s"}`)
        .child(`+${more}`));
    }
    return chips;
  }

  // The palette key as actually bound, not a hardcoded one.
  hint(t) {
    const mac = window()?.platform === "macos";
    const mod = { cmd: mac ? "⌘" : "Ctrl+", ctrl: mac ? "⌃" : "Ctrl+", shift: mac ? "⇧" : "Shift+", alt: mac ? "⌥" : "Alt+", option: mac ? "⌥" : "Alt+" };
    const b = keys().find((k) => k.section === "global" && k.action === "app.palette");
    const parts = b && b.keys.endsWith("--") ? [...b.keys.slice(0, -2).split("-"), "-"] : b?.keys.split("-");
    const key = parts && parts.map((p) => mod[p.toLowerCase()] ?? p.toUpperCase()).join("");
    return key ? `${key}  commands` : "commands";
  }

  render() {
    const t = theme();
    const space = spaces().find(s => s.active);
    const list = agents();
    const needs = list.filter(a => a.status === "blocked").length;
    const chips = this.chips(t);
    const label = (icon, text) => h_flex().gap(6).items_center().child(svg(`mods/workspace-chrome/${icon}.svg`).size(13)).child(text);
    return h_flex().size_full().px(14).gap(16).items_center().bg(t.chrome).border_t(1).border_color(t.border).text_size(11.8).text_color(t.muted)
      .child(label(space?.machine ? "server" : "monitor", space?.machine ?? "This computer"))
      .when(Boolean(space?.branch), el => el.child(label("branch", space.branch)))
      .child(h_flex().gap(6).items_center().child(div().size(6).rounded(3).bg(t.dim)).child(`${list.length} agents`)
        .when(needs > 0, el => el.child(div().text_color(t.blocked).child(`· ${needs} needs you`))))
      .when(chips.length > 0, el => el.child(div().flex_none().w(1).h(12).bg(t.border)))
      .child(h_flex().id("quota-chips").flex_1().min_w(0).gap(12).items_center().overflow_hidden()
        .on_size_change((size, cx) => {
          const width = Math.round(size.width);
          if (width !== this.leftover) { this.leftover = width; cx.notify(); }
        })
        .children(chips))
      .child(div().id("palette").text_color(t.dim).on_click(() => run("app.palette")).child(this.hint(t)));
  }
}
