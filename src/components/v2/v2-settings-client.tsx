"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { V2SettingsData } from "@/lib/v2-data";

type SaveStatus = "idle" | "saving" | "saved" | "error";

export function V2SettingsClient({ initial }: { initial: V2SettingsData }) {
  const router = useRouter();

  // Contribution
  const [amount, setAmount] = useState<string>(
    initial.contribution?.amount?.toString() ?? "",
  );
  const [currency, setCurrency] = useState<"CAD" | "USD">(initial.contribution?.currency ?? "CAD");
  const [frequency, setFrequency] = useState<"weekly" | "biweekly" | "monthly">(
    initial.contribution?.frequency ?? "weekly",
  );
  const [contribStatus, setContribStatus] = useState<SaveStatus>("idle");

  // Targets — local edit map
  const [targets, setTargets] = useState(initial.targets);
  const [targetsStatus, setTargetsStatus] = useState<Record<string, SaveStatus>>({});

  // Reserves
  const [reserves, setReserves] = useState(initial.reserves);
  const [reserveStatus, setReserveStatus] = useState<Record<string, SaveStatus>>({});

  // Redistribution
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
    () =>
      excludedTickers.reduce((s, t) => s + (reserves[t]?.targetPct ?? 0), 0),
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

  const contributionCAD = useMemo(() => {
    const amt = parseFloat(amount) || 0;
    return currency === "CAD" ? amt : amt; // UI compares to amount in source currency for warning, fxRate not loaded here
  }, [amount, currency]);

  async function saveContribution() {
    setContribStatus("saving");
    const r = await fetch("/api/v2/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "contribution",
        frequency,
        amount: parseFloat(amount) || 0,
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
      setTimeout(() => setTargetsStatus((s) => ({ ...s, [ticker]: "idle" })), 1000);
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
      setTimeout(() => setReserveStatus((s) => ({ ...s, [ticker]: "idle" })), 1000);
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
    <div className="space-y-6">
      <Help />

      {/* Contribution */}
      <Section
        title="Weekly Contribution"
        description="Total amount you plan to deploy each period. Excluded ticker reserves draw from this."
      >
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
          <Input
            label="Amount"
            type="number"
            value={amount}
            onChange={setAmount}
            min={0}
            step={1}
          />
          <Select
            label="Currency"
            value={currency}
            onChange={(v) => setCurrency(v as "CAD" | "USD")}
            options={[
              { value: "CAD", label: "CAD" },
              { value: "USD", label: "USD" },
            ]}
          />
          <Select
            label="Frequency"
            value={frequency}
            onChange={(v) => setFrequency(v as "weekly" | "biweekly" | "monthly")}
            options={[
              { value: "weekly", label: "Weekly" },
              { value: "biweekly", label: "Biweekly" },
              { value: "monthly", label: "Monthly" },
            ]}
          />
          <SaveButton onClick={saveContribution} status={contribStatus} />
        </div>
      </Section>

      {/* Targets */}
      <Section
        title="Ticker Targets"
        description="Set target % for each ticker. Toggle 'Excluded' to move a ticker into the Reserve group (e.g. SGOV, IAUM)."
        subRight={
          <span
            className={`text-[11px] tabular-nums ${
              Math.abs(targetSum - 100) > 0.5 ? "text-accent" : "text-muted-foreground"
            }`}
          >
            normal sum: {targetSum.toFixed(2)}%
          </span>
        }
      >
        <div className="overflow-hidden rounded-xl border border-border">
          {allTickers.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              No tickers in your portfolio yet.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {allTickers.map((ticker) => {
                const t = targets[ticker] ?? { pct: 0 };
                const status = targetsStatus[ticker] ?? "idle";
                return (
                  <li key={ticker} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                    <div className="w-16 font-medium">{ticker}</div>
                    <div className="flex-1 min-w-[8rem]">
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
                        className="w-24 rounded-md border border-border bg-input px-2 py-1 text-right text-sm tabular-nums"
                      />
                      <span className="ml-1 text-[11px] text-muted-foreground">%</span>
                    </div>
                    <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={!!t.excluded}
                        onChange={(e) =>
                          setTargets({
                            ...targets,
                            [ticker]: { ...t, excluded: e.target.checked },
                          })
                        }
                      />
                      excluded
                    </label>
                    <SaveButton onClick={() => saveTarget(ticker)} status={status} compact />
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Section>

      {/* Reserves */}
      <Section
        title="Reserve / Excluded Ticker Settings"
        description="For each excluded ticker, set the target reserve %, planned weekly CAD, and whether it's active. Inactive tickers receive no allocation."
        subRight={
          <div className="flex flex-col items-end text-[11px] tabular-nums">
            <span
              className={
                reservePctSum > 100 ? "text-destructive" : "text-muted-foreground"
              }
            >
              reserve sum: {reservePctSum.toFixed(2)}%
            </span>
            <span
              className={
                plannedSum > contributionCAD && contributionCAD > 0
                  ? "text-destructive"
                  : "text-muted-foreground"
              }
            >
              planned: {plannedSum.toFixed(2)} {currency}
            </span>
          </div>
        }
      >
        <div className="overflow-hidden rounded-xl border border-border">
          {excludedTickers.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              No excluded tickers yet. Toggle &quot;excluded&quot; in the Targets section above.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {excludedTickers.map((ticker) => {
                const r = reserves[ticker] ?? {
                  targetPct: 0,
                  plannedWeeklyCAD: 0,
                  active: true,
                };
                const status = reserveStatus[ticker] ?? "idle";
                return (
                  <li key={ticker} className="grid gap-2 px-3 py-3 sm:grid-cols-[6rem_1fr_1fr_auto_auto]">
                    <div className="font-medium">{ticker}</div>
                    <NumberField
                      label="Target %"
                      value={r.targetPct}
                      max={100}
                      onChange={(v) =>
                        setReserves({ ...reserves, [ticker]: { ...r, targetPct: v } })
                      }
                    />
                    <NumberField
                      label="Planned (CAD)"
                      value={r.plannedWeeklyCAD}
                      onChange={(v) =>
                        setReserves({ ...reserves, [ticker]: { ...r, plannedWeeklyCAD: v } })
                      }
                    />
                    <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={r.active}
                        onChange={(e) =>
                          setReserves({
                            ...reserves,
                            [ticker]: { ...r, active: e.target.checked },
                          })
                        }
                      />
                      active
                    </label>
                    <SaveButton onClick={() => saveReserve(ticker)} status={status} compact />
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Section>

      {/* Redistribution Rule */}
      <Section
        title="Redistribution Rule"
        description="When an excluded ticker has reached its reserve target, where does its planned amount go?"
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
            <label key={opt.id} className="flex items-start gap-2 rounded-lg border border-border p-3 cursor-pointer hover:bg-muted/30">
              <input
                type="radio"
                name="rule"
                checked={rule === opt.id}
                onChange={() => setRule(opt.id)}
                className="mt-0.5"
              />
              <div>
                <div className="text-sm font-medium">{opt.label}</div>
                <div className="text-[11px] text-muted-foreground">{opt.hint}</div>
              </div>
            </label>
          ))}
          {rule === "priority" ? (
            <div>
              <label className="text-[11px] uppercase tracking-widest text-muted-foreground">
                Priority list (comma-separated tickers)
              </label>
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
                className="mt-1 w-full rounded-md border border-border bg-input px-2 py-1.5 text-sm"
              />
            </div>
          ) : null}
          <div className="flex justify-end">
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
    <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          {description ? <p className="mt-0.5 text-[11px] text-muted-foreground">{description}</p> : null}
        </div>
        {subRight}
      </div>
      {children}
    </section>
  );
}

function Help() {
  return (
    <details className="rounded-xl border border-border bg-card p-3 text-[11px]">
      <summary className="cursor-pointer text-xs font-medium">How v2 allocation works</summary>
      <ol className="mt-2 list-decimal pl-5 space-y-1 text-muted-foreground">
        <li>Each period your <em>Weekly Contribution</em> is the total CAD to deploy.</li>
        <li>Excluded tickers receive their <em>Planned (CAD)</em> first, capped at the gap to their reserve target.</li>
        <li>If an excluded ticker is already at/above its reserve target, its planned amount is redistributed using your rule.</li>
        <li>Whatever remains goes to Normal tickers, weighted by their target shortfall.</li>
        <li>If planned-excluded sum exceeds Weekly Contribution, all planned amounts are scaled down proportionally.</li>
      </ol>
    </details>
  );
}

function Input({
  label,
  type,
  value,
  onChange,
  min,
  step,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  min?: number;
  step?: number;
}) {
  return (
    <label className="flex flex-col">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        min={min}
        step={step}
        className="mt-1 rounded-md border border-border bg-input px-2 py-1.5 text-sm tabular-nums"
      />
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex flex-col">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 rounded-md border border-border bg-input px-2 py-1.5 text-sm"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  max?: number;
}) {
  return (
    <label className="flex flex-col">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
      <input
        type="number"
        value={value}
        min={0}
        max={max}
        step={0.1}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="mt-1 w-full rounded-md border border-border bg-input px-2 py-1.5 text-right text-sm tabular-nums"
      />
    </label>
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
        ? "✓ Saved"
        : status === "error"
          ? "Error"
          : "Save";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={status === "saving"}
      className={`rounded-md border border-border bg-background ${
        compact ? "px-2 py-1 text-[11px]" : "px-3 py-1.5 text-xs"
      } font-medium transition-colors hover:bg-muted disabled:opacity-50 ${
        status === "saved"
          ? "border-primary/50 text-primary"
          : status === "error"
            ? "border-destructive text-destructive"
            : ""
      }`}
    >
      {label}
    </button>
  );
}
