// Pure view-model over `quota-axi --json` output (schemaVersion 5).
// No herdr or gpui imports, so tests run anywhere. Renderers turn the
// `tone` fields into theme colors; nothing here draws.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** fresh → "live", stale → "stale", anything else (auth_required,
 *  unavailable, notSetUp) → "unavailable". Unknown statuses never crash. */
export function classifyProvider(p) {
  if (!p || typeof p !== "object") return "unavailable";
  const status = p.state?.status;
  if (status === "fresh") return "live";
  if (status === "stale") return "stale";
  return "unavailable";
}

/** "all_models" → "all models", "model:general" → "general", else the
 *  scope with underscores spaced. Credits and product scopes stay as-is. */
export function scopeLabel(scope) {
  if (typeof scope !== "string" || scope === "") return "";
  if (scope === "all_models") return "all models";
  if (scope.startsWith("model:")) return scope.slice("model:".length);
  return scope.replaceAll("_", " ");
}

/** The scope entry a provider is really limited by: the lowest known
 *  effectivePercentRemaining, preferring "all_models" on a tie. Null when
 *  the provider reports no numeric availability (credits-only, unknown). */
export function pickTightest(provider, now = Date.now()) {
  const avail = provider?.quotaSemantics?.effectiveAvailability;
  if (!Array.isArray(avail)) return null;
  let best = null;
  for (const a of avail) {
    if (typeof a?.effectivePercentRemaining !== "number") continue;
    if (
      !best ||
      a.effectivePercentRemaining < best.effectivePercentRemaining ||
      (a.effectivePercentRemaining === best.effectivePercentRemaining && a.scope === "all_models")
    ) {
      best = a;
    }
  }
  if (!best) return null;
  const windows = Array.isArray(provider.windows) ? provider.windows : [];
  const byId = new Map(windows.map((w) => [w?.id, w]));
  const limiting = (best.limitingWindowIds ?? []).map(
    (id) => windowView(byId.get(id) ?? { id, label: id, kind: "unknown" }, now),
  );
  return {
    scope: best.scope,
    label: scopeLabel(best.scope),
    percent: best.effectivePercentRemaining,
    limiting,
    pace: best.pace ?? null,
    runway: best.runway ?? null,
    spendPriority: best.selection?.spendPriority ?? null,
  };
}

/** "5m", "3h 12m", "2d 8h". Past or unparsable dates never break the view. */
export function formatReset(iso, now = Date.now()) {
  if (typeof iso !== "string" || iso === "") return "";
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return "";
  const left = at - now;
  if (left <= 0) return "resets soon";
  const minutes = Math.max(1, Math.round(left / MINUTE));
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 48 * 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  const hours = Math.round(left / HOUR);
  const d = Math.floor(hours / 24);
  const h = hours % 24;
  return h ? `${d}d ${h}h` : `${d}d`;
}

/** "just now", "4m ago", "2h ago" — how old the reading is. */
export function formatAge(ms, now = Date.now()) {
  if (typeof ms !== "number" || Number.isNaN(ms)) return "";
  const age = Math.max(0, now - ms);
  if (age < MINUTE) return "just now";
  const minutes = Math.round(age / MINUTE);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(age / HOUR);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(age / DAY)}d ago`;
}

/** Color bucket for a remaining percentage. null → "none". */
export function remainingTone(percent) {
  if (typeof percent !== "number" || Number.isNaN(percent)) return "none";
  if (percent >= 60) return "ok";
  if (percent >= 30) return "warn";
  return "low";
}

/** Pace wording: quota-axi reports on_pace / behind / unknown; unknown
 *  values pass through untouched so new statuses still read. */
export function paceText(status) {
  if (typeof status !== "string" || status === "") return null;
  return status.replaceAll("_", " ");
}

export function paceTone(status) {
  if (status === "on_pace" || status === "ahead") return "ok";
  if (status === "behind") return "warn";
  return "none";
}

/** A docked copy shorter than this renders as a one-line status bar. */
export function barMode(height) {
  return typeof height === "number" && height > 0 && height <= 56;
}

function windowView(w, now) {
  return {
    id: w?.id ?? "",
    label: w?.label ?? w?.id ?? "window",
    kind: w?.kind ?? "unknown",
    percentRemaining: typeof w?.percentRemaining === "number" ? w.percentRemaining : null,
    percentUsed: typeof w?.percentUsed === "number" ? w.percentUsed : null,
    shareOf: w?.shareOf ?? null,
    resetsAt: w?.resetsAt ?? null,
    resetIn: formatReset(w?.resetsAt, now),
    pace: w?.pace ?? null,
  };
}

/** The whole pane's data: active providers sorted tightest-first, and the
 *  not-set-up ones folded into one group with their reasons. */
export function summarize(report, now = Date.now()) {
  const list = Array.isArray(report?.providers) ? report.providers : [];
  const generatedAt =
    typeof report?.generatedAt === "string" && !Number.isNaN(Date.parse(report.generatedAt))
      ? Date.parse(report.generatedAt)
      : null;

  const active = [];
  const unavailable = [];
  for (const p of list) {
    const status = classifyProvider(p);
    if (status === "unavailable") {
      unavailable.push({
        name: p?.provider ?? "?",
        reason: p?.state?.error ?? p?.state?.reason ?? "not set up",
      });
      continue;
    }
    const tightest = pickTightest(p, now);
    active.push({
      name: p?.provider ?? "?",
      plan: typeof p?.plan === "string" ? p.plan : null,
      status,
      tightest,
      windows: (Array.isArray(p?.windows) ? p.windows : []).map((w) => windowView(w, now)),
      credits: p?.credits && typeof p.credits === "object" ? p.credits : null,
      error: p?.state?.error ?? null,
      remedy: p?.state?.remedyCommand ?? null,
    });
  }

  active.sort((a, b) => {
    const pa = a.tightest?.percent;
    const pb = b.tightest?.percent;
    if (typeof pa === "number" && typeof pb === "number" && pa !== pb) return pa - pb;
    if (typeof pa === "number" && typeof pb !== "number") return -1;
    if (typeof pa !== "number" && typeof pb === "number") return 1;
    return a.name.localeCompare(b.name);
  });

  return { generatedAt, active, unavailable };
}
