"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { V2SettingsData } from "@/lib/v2-data";

type SaveStatus = "idle" | "saving" | "saved" | "error";

export function V2SettingsClient({ initial }: { initial: V2SettingsData }) {
  const router = useRouter();

  const [amount, setAmount] = useState<string>(
    initial.contribution?.amount?.toString() ?? "",
  );
  const [currency, setCurrency] = useState<"CAD" | "USD">(initial.contribution?.currency ?? "CAD");
  const [frequency, setFrequency] = useState<"weekly" | "biweekly" | "monthly">(
    initial.contribution?.frequency ?? "weekly",
  );
  const [contribStatus, setContribStatus] = useState<SaveStatus>("idle");

  const [targets, setTargets] = useState(initial.targets);
  const [targetsStatus, setTargetsStatus] = useState<Record<string, SaveStatus>>({});

  const [reserves, setReserves] = useState(initial.reserves);
  const [reserveStatus, setReserveStatus] = useState<Record<string, SaveStatus>>({});

  const [rule, setRule] = useState<"shortfall_proportional" | "even" | "priority">(
    initial.redistribution.rule,
  );
  const [priorityList, setPriorityList] = useState<string[]>(
    initial.redistribution.rule === "priority" ? initial.redistribution.priorityList : [],
  );
  const [ruleStatus, setRuleStatus] = useState<SaveStatus>("idle");

  const [, startTransition] = useTransition();

  const allTickers = useMemo(() => {
    const set = new Set<string>(initial.tickers);
    for (const t of Object.keys(targets)) set.add(t);
    for (const t of Object.keys(reserves)) set.add(t);
    return Array.from(set).sort();
  }, [initial.tickers, targets, reserves]);

  const excludedTickers = useMemo(
    () => allTickers.filter((t) => targets[t]?.excluded),
    [allTickers, targets],
  );

  const targetSum = useMemo(
    () =>
      allTickers
        .filter((t) => !targets[t]?.excluded)
        .reduce((s, t) => s + (targets[t]?.pct ?? 0), 0),
    [allTickers, targets],
  );

  const reservePctSum = useMemo(
    () => excludedTickers.reduce((s, t) => s + (reserves[t]?.targetPct ?? 0), 0),
    [excludedTickers, reserves],
  );

  const plannedSum = useMemo(
    () =>
      excludedTickers.reduce(
        (s, t) => s + (reserves[t]?.active ? reserves[t].plannedWeeklyCAD : 0),
        0,
      ),
    [excludedTickers, reserves],
  );

  const contribAmt = parseFloat(amount) || 0;

  async function saveContribution() {
    setContribStatus("saving");
    const r = await fetch("/api/v2/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "contribution",
        frequency,
        amount: contribAmt,
        currency,
      }),
    });
    if (r.ok) {
      setContribStatus("saved");
      startTransition(() => router.refresh());
      setTimeout(() => setContribStatus("idle"), 1200);
    } else {
      setContribStatus("error");
    }
  }

  async function saveTarget(ticker: string) {
    setTargetsStatus((s) => ({ ...s, [ticker]: "saving" }));
    const t = targets[ticker] ?? { pct: 0 };
    const r = await fetch("/api/v2/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "target",
        ticker,
        pct: t.pct,
        excluded: !!t.excluded,
      }),
    });
    if (r.ok) {
      setTargetsStatus((s) => ({ ...s, [ticker]: "saved" }));
      startTransition(() => router.refresh());
      setTimeout(() => setTargetsStatus((s) => ({ ...s, [ticker]: "idle" })), 1200);
    } else {
      setTargetsStatus((s) => ({ ...s, [ticker]: "error" }));
    }
  }

  async function saveReserve(ticker: string) {
    setReserveStatus((s) => ({ ...s, [ticker]: "saving" }));
    const r = reserves[ticker] ?? { targetPct: 0, plannedWeeklyCAD: 0, active: false };
    const resp = await fetch("/api/v2/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "reserve",
        ticker,
        targetPct: r.targetPct,
        plannedWeeklyCAD: r.plannedWeeklyCAD,
        active: r.active,
      }),
    });
    if (resp.ok) {
      setReserveStatus((s) => ({ ...s, [ticker]: "saved" }));
      startTransition(() => router.refresh());
      setTimeout(() => setReserveStatus((s) => ({ ...s, [ticker]: "idle" })), 1200);
    } else {
      setReserveStatus((s) => ({ ...s, [ticker]: "error" }));
    }
  }

  async function saveRule() {
    setRuleStatus("saving");
    const body: Record<string, unknown> = { type: "redistribution_rule", rule };
    if (rule === "priority") body.priorityList = priorityList;
    const r = await fetch("/api/v2/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (r.ok) {
      setRuleStatus("saved");
      startTransition(() => router.refresh());
      setTimeout(() => setRuleStatus("idle"), 1200);
    } else {
      setRuleStatus("error");
    }
  }

  return (
    <div className="space-y-7">
      <Help />

      <ThemeSection />

      <Section
        title="Weekly Contribution"
        description="Total amount you plan to deploy each period. Excluded ticker reserves draw from this."
      >
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
          <Field label="Amount">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min={0}
              step={1}
              className="v2-input v2-tnum"
            />
          </Field>
          <Field label="Currency">
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as "CAD" | "USD")}
              className="v2-select"
            >
              <option value="CAD">CAD</option>
              <option value="USD">USD</option>
            </select>
          </Field>
          <Field label="Frequency">
            <select
              value={frequency}
              onChange={(e) =>
                setFrequency(e.target.value as "weekly" | "biweekly" | "monthly")
              }
              className="v2-select"
            >
              <option value="weekly">Weekly</option>
              <option value="biweekly">Biweekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </Field>
          <SaveButton onClick={saveContribution} status={contribStatus} />
        </div>
      </Section>

      <Section
        title="Ticker Targets"
        description="Set target % for each ticker. Toggle excluded to move a ticker into the Reserve group (e.g. SGOV, IAUM)."
        subRight={
          <span
            className="v2-tnum v2-fineprint"
            style={{
              color:
                Math.abs(targetSum - 100) > 0.5
                  ? "hsl(36 90% 38%)"
                  : "hsl(var(--v2-ink-muted-48))",
            }}
          >
            normal sum {targetSum.toFixed(2)}%
          </span>
        }
      >
        {allTickers.length === 0 ? (
          <EmptyHint>No tickers in your portfolio yet.</EmptyHint>
        ) : (
          <ul className="divide-y" style={{ borderColor: "hsl(var(--v2-divider-soft))" }}>
            {allTickers.map((ticker) => {
              const t = targets[ticker] ?? { pct: 0 };
              const status = targetsStatus[ticker] ?? "idle";
              return (
                <li
                  key={ticker}
                  className="flex flex-wrap items-center gap-3 py-3"
                  style={{ borderColor: "hsl(var(--v2-divider-soft))" }}
                >
                  <div className="v2-body-strong" style={{ width: 72 }}>
                    {ticker}
                  </div>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={t.pct}
                      min={0}
                      max={100}
                      step={0.1}
                      onChange={(e) =>
                        setTargets({
                          ...targets,
                          [ticker]: { ...t, pct: parseFloat(e.target.value) || 0 },
                        })
                      }
                      className="v2-input v2-tnum"
                      style={{ width: 92, textAlign: "right" }}
                    />
                    <span className="v2-caption">%</span>
                  </div>
                  <Toggle
                    label="excluded"
                    checked={!!t.excluded}
                    onChange={(checked) =>
                      setTargets({
                        ...targets,
                        [ticker]: { ...t, excluded: checked },
                      })
                    }
                  />
                  <div className="ml-auto">
                    <SaveButton onClick={() => saveTarget(ticker)} status={status} compact />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section
        title="Reserve / Excluded Settings"
        description="For each excluded ticker, set the target reserve %, planned weekly CAD, and whether it's active. Inactive tickers receive no allocation."
        subRight={
          <div className="text-right v2-fineprint v2-tnum" style={{ lineHeight: 1.4 }}>
            <div
              style={{
                color:
                  reservePctSum > 100
                    ? "hsl(var(--negative))"
                    : "hsl(var(--v2-ink-muted-48))",
              }}
            >
              reserve sum {reservePctSum.toFixed(2)}%
            </div>
            <div
              style={{
                color:
                  plannedSum > contribAmt && contribAmt > 0
                    ? "hsl(var(--negative))"
                    : "hsl(var(--v2-ink-muted-48))",
              }}
            >
              planned {plannedSum.toFixed(2)} {currency}
            </div>
          </div>
        }
      >
        {excludedTickers.length === 0 ? (
          <EmptyHint>
            No excluded tickers yet. Toggle &ldquo;excluded&rdquo; in the Targets section above.
          </EmptyHint>
        ) : (
          <ul className="divide-y" style={{ borderColor: "hsl(var(--v2-divider-soft))" }}>
            {excludedTickers.map((ticker) => {
              const r = reserves[ticker] ?? {
                targetPct: 0,
                plannedWeeklyCAD: 0,
                active: true,
              };
              const status = reserveStatus[ticker] ?? "idle";
              return (
                <li
                  key={ticker}
                  className="grid grid-cols-1 gap-3 py-4 sm:grid-cols-[6rem_1fr_1fr_auto_auto] sm:items-end"
                >
                  <div className="v2-body-strong">{ticker}</div>
                  <Field label="Target %">
                    <input
                      type="number"
                      value={r.targetPct}
                      min={0}
                      max={100}
                      step={0.1}
                      onChange={(e) =>
                        setReserves({
                          ...reserves,
                          [ticker]: { ...r, targetPct: parseFloat(e.target.value) || 0 },
                        })
                      }
                      className="v2-input v2-tnum"
                      style={{ textAlign: "right" }}
                    />
                  </Field>
                  <Field label="Planned (CAD)">
                    <input
                      type="number"
                      value={r.plannedWeeklyCAD}
                      min={0}
                      step={0.5}
                      onChange={(e) =>
                        setReserves({
                          ...reserves,
                          [ticker]: {
                            ...r,
                            plannedWeeklyCAD: parseFloat(e.target.value) || 0,
                          },
                        })
                      }
                      className="v2-input v2-tnum"
                      style={{ textAlign: "right" }}
                    />
                  </Field>
                  <Toggle
                    label="active"
                    checked={r.active}
                    onChange={(checked) =>
                      setReserves({
                        ...reserves,
                        [ticker]: { ...r, active: checked },
                      })
                    }
                  />
                  <SaveButton onClick={() => saveReserve(ticker)} status={status} compact />
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section
        title="Redistribution Rule"
        description="When an excluded ticker reaches its reserve target, where does its planned amount go?"
      >
        <div className="space-y-3">
          {(
            [
              {
                id: "shortfall_proportional",
                label: "Shortfall-proportional",
                hint: "Distribute overflow proportionally to remaining gap of underweight excluded tickers.",
              },
              {
                id: "even",
                label: "Even split",
                hint: "Split overflow evenly across underweight excluded tickers.",
              },
              {
                id: "priority",
                label: "Priority list",
                hint: "Fill the listed tickers in order until their target is met.",
              },
            ] as const
          ).map((opt) => (
            <label
              key={opt.id}
              className="flex cursor-pointer items-start gap-3 rounded-[11px] p-3 transition-colors"
              style={{
                border:
                  rule === opt.id
                    ? "1px solid hsl(var(--ring))"
                    : "1px solid hsl(var(--v2-hairline))",
                background:
                  rule === opt.id
                    ? "hsla(var(--v2-action-blue) / 0.04)"
                    : "transparent",
              }}
            >
              <input
                type="radio"
                name="rule"
                checked={rule === opt.id}
                onChange={() => setRule(opt.id)}
                style={{ accentColor: "hsl(var(--v2-action-blue))", marginTop: 4 }}
              />
              <div>
                <div className="v2-body-strong" style={{ fontSize: 15 }}>
                  {opt.label}
                </div>
                <div className="v2-caption" style={{ marginTop: 2 }}>
                  {opt.hint}
                </div>
              </div>
            </label>
          ))}
          {rule === "priority" ? (
            <Field label="Priority list (comma-separated tickers)">
              <input
                type="text"
                value={priorityList.join(", ")}
                onChange={(e) =>
                  setPriorityList(
                    e.target.value
                      .split(",")
                      .map((t) => t.trim().toUpperCase())
                      .filter(Boolean),
                  )
                }
                placeholder="e.g. IAUM, SGOV"
                className="v2-input"
              />
            </Field>
          ) : null}
          <div className="flex justify-end pt-1">
            <SaveButton onClick={saveRule} status={ruleStatus} />
          </div>
        </div>
      </Section>
    </div>
  );
}

function Section({
  title,
  description,
  children,
  subRight,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  subRight?: React.ReactNode;
}) {
  return (
    <section className="v2-card p-5 sm:p-6">
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="v2-display v2-display-md" style={{ color: "hsl(var(--v2-ink-strong))" }}>
            {title}
          </h2>
          {description ? (
            <p className="v2-caption" style={{ marginTop: 2, maxWidth: 540 }}>
              {description}
            </p>
          ) : null}
        </div>
        {subRight}
      </header>
      {children}
    </section>
  );
}

function ThemeSection() {
  const [mode, setMode] = useState<"dark" | "light">("light");

  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".v2-root");
    setMode(root?.getAttribute("data-v2-mode") === "dark" ? "dark" : "light");
  }, []);

  const setAndApply = (next: "dark" | "light") => {
    setMode(next);
    const root = document.querySelector<HTMLElement>(".v2-root");
    if (root) root.setAttribute("data-v2-mode", next);
    try {
      localStorage.setItem("dt-v2-theme", next);
    } catch {
      /* ignore */
    }
  };

  return (
    <Section title="Appearance" description="Switch between light and dark mode for v2.">
      <div className="v2-segmented">
        <button type="button" data-active={mode === "light"} onClick={() => setAndApply("light")}>
          Light
        </button>
        <button type="button" data-active={mode === "dark"} onClick={() => setAndApply("dark")}>
          Dark
        </button>
      </div>
    </Section>
  );
}

function Help() {
  return (
    <details
      className="v2-card-soft p-4"
      style={{ background: "hsl(var(--v2-canvas-parchment))" }}
    >
      <summary className="cursor-pointer v2-body-strong" style={{ fontSize: 15 }}>
        How v2 allocation works
      </summary>
      <ol
        className="mt-3 space-y-1.5 v2-caption"
        style={{ color: "hsl(var(--v2-ink-muted-80))", paddingLeft: 18, listStyle: "decimal" }}
      >
        <li>Each period your Weekly Contribution is the total CAD to deploy.</li>
        <li>
          Excluded tickers receive their Planned (CAD) first, capped at the gap to their reserve
          target.
        </li>
        <li>
          If an excluded ticker is already at/above its reserve target, its planned amount is
          redistributed using your rule.
        </li>
        <li>Whatever remains goes to Normal tickers, weighted by their target shortfall.</li>
        <li>
          If planned-excluded sum exceeds Weekly Contribution, all planned amounts are scaled down
          proportionally.
        </li>
      </ol>
    </details>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="v2-fineprint">{label}</span>
      {children}
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 select-none">
      <span
        role="switch"
        aria-checked={checked}
        tabIndex={0}
        onClick={() => onChange(!checked)}
        onKeyDown={(e) => {
          if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            onChange(!checked);
          }
        }}
        style={{
          position: "relative",
          width: 38,
          height: 22,
          borderRadius: 9999,
          background: checked
            ? "hsl(var(--v2-action-blue))"
            : "hsl(0 0% 80%)",
          transition: "background 160ms ease",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 2,
            left: checked ? 18 : 2,
            width: 18,
            height: 18,
            borderRadius: 9999,
            background: "#fff",
            transition: "left 160ms ease",
            boxShadow: "0 1px 2px rgba(0,0,0,0.18)",
          }}
        />
      </span>
      <span className="v2-caption">{label}</span>
    </label>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="v2-caption rounded-[11px] px-4 py-6 text-center"
      style={{ background: "hsl(var(--v2-canvas-parchment))" }}
    >
      {children}
    </div>
  );
}

function SaveButton({
  onClick,
  status,
  compact,
}: {
  onClick: () => void;
  status: SaveStatus;
  compact?: boolean;
}) {
  const label =
    status === "saving"
      ? "Saving…"
      : status === "saved"
        ? "Saved"
        : status === "error"
          ? "Try again"
          : "Save";

  const isError = status === "error";
  const isSaved = status === "saved";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={status === "saving"}
      className={isError ? "v2-btn v2-btn-secondary" : "v2-btn v2-btn-primary"}
      style={
        compact
          ? { padding: "6px 14px", fontSize: 13 }
          : undefined
      }
    >
      {isSaved ? "✓ " : ""}
      {label}
    </button>
  );
}
