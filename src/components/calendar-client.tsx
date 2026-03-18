"use client";

import { useState, useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface DividendCalendarEvent {
  ticker: string;
  name: string;
  exDividendDate: string | null;
  paymentDate: string | null;
  amountPerShare: number | null;
  annualDividend: number | null;
  frequency: number | null;
  dividendYield: number | null;
  currency: string;
  portfolios: string[];
  sharesHeld: number;
}

interface DayEvent {
  ticker: string;
  name: string;
  type: "exdiv" | "payment";
  predicted: boolean;
  amount: number | null;
  currency: string;
  sharesHeld: number;
}

const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONTHS = [
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
];

const FREQ_LABEL: Record<number, string> = {
  1: "ANNUAL",
  2: "SEMI-ANNUAL",
  4: "QUARTERLY",
  12: "MONTHLY",
};

/** Project dividend dates anchored to today so future dates are always generated */
function projectDates(baseDateStr: string, frequency: number, windowDays = 120): string[] {
  if (frequency <= 0) return [];
  const intervalMonths = 12 / frequency;
  const base = new Date(baseDateStr + "T12:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const windowEnd = new Date(today);
  windowEnd.setDate(windowEnd.getDate() + windowDays);

  // Fast-forward base to the first occurrence on or after today
  const d = new Date(base);
  while (d < today) {
    d.setMonth(d.getMonth() + intervalMonths);
  }
  // Step back one interval to include the most recent past occurrence too
  d.setMonth(d.getMonth() - intervalMonths);

  const dates: string[] = [];
  const cur = new Date(d);
  while (cur <= windowEnd) {
    dates.push(cur.toISOString().split("T")[0]);
    cur.setMonth(cur.getMonth() + intervalMonths);
  }
  return dates;
}

/** Build a map of date → events for the given year/month, including predictions */
function buildEventMap(
  events: DividendCalendarEvent[],
  year: number,
  month: number // 0-indexed
): Map<string, DayEvent[]> {
  const map = new Map<string, DayEvent[]>();
  const monthStr = `${year}-${String(month + 1).padStart(2, "0")}`;

  function addToMap(dateStr: string, event: DayEvent) {
    if (!dateStr.startsWith(monthStr)) return;
    const day = dateStr.split("T")[0];
    if (!map.has(day)) map.set(day, []);
    map.get(day)!.push(event);
  }

  for (const ev of events) {
    const base = { ticker: ev.ticker, name: ev.name, amount: ev.amountPerShare, currency: ev.currency, sharesHeld: ev.sharesHeld };

    // Ex-dividend dates (real + predicted)
    if (ev.exDividendDate) {
      const realEx = ev.exDividendDate.split("T")[0];
      addToMap(realEx, { ...base, type: "exdiv", predicted: false });
      if (ev.frequency) {
        for (const d of projectDates(realEx, ev.frequency)) {
          if (d !== realEx) addToMap(d, { ...base, type: "exdiv", predicted: true });
        }
      }
    }

    // Payment dates (real + predicted)
    if (ev.paymentDate) {
      const realPay = ev.paymentDate.split("T")[0];
      addToMap(realPay, { ...base, type: "payment", predicted: false });
      if (ev.frequency) {
        for (const d of projectDates(realPay, ev.frequency)) {
          if (d !== realPay) addToMap(d, { ...base, type: "payment", predicted: true });
        }
      }
    }
  }

  return map;
}

/** Upcoming events for the next 90 days */
function buildUpcoming(events: DividendCalendarEvent[]): {
  date: string;
  event: DayEvent;
}[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() + 90);

  const upcoming: { date: string; event: DayEvent }[] = [];

  for (const ev of events) {
    const base = { ticker: ev.ticker, name: ev.name, amount: ev.amountPerShare, currency: ev.currency, sharesHeld: ev.sharesHeld };

    const addIfUpcoming = (dateStr: string | null, type: "exdiv" | "payment") => {
      if (!dateStr) return;
      const realDate = dateStr.split("T")[0];
      const allDates: { d: string; predicted: boolean }[] = [{ d: realDate, predicted: false }];
      if (ev.frequency) {
        for (const d of projectDates(realDate, ev.frequency)) {
          if (d !== realDate) allDates.push({ d, predicted: true });
        }
      }
      for (const { d, predicted } of allDates) {
        const dt = new Date(d);
        if (dt >= today && dt <= cutoff) {
          upcoming.push({ date: d, event: { ...base, type, predicted } });
        }
      }
    };

    addIfUpcoming(ev.exDividendDate, "exdiv");
    addIfUpcoming(ev.paymentDate, "payment");
  }

  upcoming.sort((a, b) => a.date.localeCompare(b.date));

  // Dedupe
  const seen = new Set<string>();
  return upcoming.filter((u) => {
    const key = `${u.date}-${u.event.ticker}-${u.event.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function fmt2(n: number) {
  return n.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function CalendarClient() {
  const [events, setEvents] = useState<DividendCalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const calendarRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    fetch("/api/calendar")
      .then((r) => r.json())
      .then((data) => { setEvents(data); setLoading(false); })
      .catch(() => { setError("Failed to load calendar data"); setLoading(false); });
  }, []);

  // Swipe to change month
  useEffect(() => {
    const el = calendarRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      touchStartRef.current = { x: t.clientX, y: t.clientY };
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!touchStartRef.current) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - touchStartRef.current.x;
      const dy = t.clientY - touchStartRef.current.y;
      touchStartRef.current = null;

      if (Math.abs(dx) < 50) return;
      if (Math.abs(dx) < Math.abs(dy) * 1.5) return;

      if (dx < 0) {
        // Swipe left → next month
        setMonth(m => { if (m === 11) { setYear(y => y + 1); return 0; } return m + 1; });
        setSelectedDay(null);
      } else {
        // Swipe right → previous month
        setMonth(m => { if (m === 0) { setYear(y => y - 1); return 11; } return m - 1; });
        setSelectedDay(null);
      }
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
    setSelectedDay(null);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
    setSelectedDay(null);
  };

  const eventMap = buildEventMap(events, year, month);
  const upcoming = buildUpcoming(events);

  // Build calendar grid
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = now.toISOString().split("T")[0];

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // Pad to complete last row
  while (cells.length % 7 !== 0) cells.push(null);

  const selectedEvents = selectedDay ? (eventMap.get(selectedDay) ?? []) : [];

  if (loading) {
    return (
      <div className="text-muted-foreground text-xs py-12 text-center">
        LOADING DIVIDEND DATA...
      </div>
    );
  }

  if (error) {
    return <div className="text-negative text-xs py-8 text-center">{error}</div>;
  }

  return (
    <div ref={calendarRef} className="space-y-6">
      {/* Legend */}
      <div className="flex gap-4 text-[10px] tracking-widest">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 cal-exdiv" />
          EX-DIV DATE
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 cal-payment" />
          PAYMENT DATE
        </span>
        <span className="flex items-center gap-1 text-muted-foreground">
          * PREDICTED
        </span>
      </div>

      {/* Month navigation */}
      <div className="flex items-center gap-4">
        <button onClick={prevMonth} className="btn-retro p-1">
          <ChevronLeft size={14} />
        </button>
        <span className="text-accent tracking-widest text-sm flex-1 text-center">
          {MONTHS[month]} {year}
        </span>
        <button onClick={nextMonth} className="btn-retro p-1">
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 gap-1">
        {DAYS.map((d) => (
          <div key={d} className="text-center text-[9px] text-muted-foreground tracking-widest py-1">
            <span className="hidden sm:inline">{d}</span>
            <span className="sm:hidden">{d[0]}</span>
          </div>
        ))}

        {/* Calendar cells */}
        {cells.map((day, i) => {
          if (!day) return <div key={`empty-${i}`} />;

          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const dayEvents = eventMap.get(dateStr) ?? [];
          const hasExDiv = dayEvents.some((e) => e.type === "exdiv");
          const hasPayment = dayEvents.some((e) => e.type === "payment");
          const allPredicted = dayEvents.length > 0 && dayEvents.every((e) => e.predicted);
          const isToday = dateStr === todayStr;
          const isSelected = dateStr === selectedDay;

          let cellClass = "cal-day relative rounded-[2px] p-1 text-center cursor-pointer transition-all min-h-[40px]";
          if (allPredicted) cellClass += " opacity-50";
          if (hasExDiv && hasPayment) cellClass += " cal-both";
          else if (hasExDiv) cellClass += " cal-exdiv";
          else if (hasPayment) cellClass += " cal-payment";
          else cellClass += " border border-transparent hover:border-border";

          if (isSelected) cellClass += " ring-1 ring-primary";

          return (
            <div
              key={dateStr}
              className={cellClass}
              onClick={() => setSelectedDay(isSelected ? null : dateStr)}
            >
              <span className={`text-[11px] ${isToday ? "text-accent font-medium" : ""}`}>
                {day}
              </span>
              {dayEvents.length > 0 && (
                <div className="flex flex-wrap gap-[2px] mt-1 justify-center">
                  {dayEvents.slice(0, 2).map((e, idx) => (
                    <span
                      key={idx}
                      className="text-[8px] leading-none tracking-tighter truncate max-w-full"
                      style={{ color: e.type === "exdiv" ? "hsl(var(--accent))" : "hsl(var(--primary))" }}
                    >
                      {e.ticker}
                    </span>
                  ))}
                  {dayEvents.length > 2 && (
                    <span className="text-[8px] text-muted-foreground">+{dayEvents.length - 2}</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Selected day detail */}
      {selectedDay && selectedEvents.length > 0 && (
        <div className="border border-border bg-card p-4 space-y-2">
          <div className="text-accent text-xs tracking-widest mb-3">
            {new Date(selectedDay + "T12:00:00").toLocaleDateString("en-CA", {
              weekday: "long", year: "numeric", month: "long", day: "numeric",
            }).toUpperCase()}
          </div>
          {selectedEvents.map((e, i) => (
            <div key={i} className="flex items-center justify-between text-xs border-b border-border/50 pb-2 last:border-0 last:pb-0">
              <div>
                <span className="font-medium">{e.ticker}</span>
                <span className="text-muted-foreground ml-2">{e.name}</span>
              </div>
              <div className="text-right">
                <span
                  className="text-[10px] tracking-widest px-1 py-0.5 border"
                  style={{
                    color: e.type === "exdiv" ? "hsl(var(--accent))" : "hsl(var(--primary))",
                    borderColor: e.type === "exdiv" ? "hsl(var(--accent) / 0.4)" : "hsl(var(--primary) / 0.4)",
                  }}
                >
                  {e.type === "exdiv" ? "EX-DIV" : "PAYMENT"}
                </span>
                {e.amount && (
                  <div className="text-muted-foreground text-[10px] mt-0.5">
                    {e.currency === "CAD" ? "C$" : "$"}{fmt2(e.amount)}/sh
                  </div>
                )}
                {e.type === "payment" && e.amount && e.sharesHeld > 0 && (
                  <div className="text-primary tabular-nums text-xs mt-1">
                    TOTAL: {e.currency === "CAD" ? "C$" : "$"}{fmt2(e.amount * e.sharesHeld)}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upcoming dividends list */}
      <div>
        <div className="text-xs tracking-widest text-accent mb-3">
          UPCOMING — NEXT 90 DAYS
        </div>
        {upcoming.length === 0 ? (
          <div className="text-muted-foreground text-xs text-center py-6 border border-dashed border-border">
            NO DIVIDEND EVENTS FOUND
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th className="text-left">TICKER</th>
                  <th className="text-left">TYPE</th>
                  <th className="text-left">DATE</th>
                  <th className="text-right">AMOUNT/SH</th>
                  <th className="text-right hidden sm:table-cell">TOTAL</th>
                  <th className="text-left hidden sm:table-cell">PORTFOLIO</th>
                </tr>
              </thead>
              <tbody>
                {upcoming.map((u, i) => {
                  const ev = events.find((e) => e.ticker === u.event.ticker);
                  const portfolio = ev?.portfolios.join(", ") ?? "";
                  return (
                    <tr key={i} className={u.event.predicted ? "opacity-50" : ""}>
                      <td className="font-medium">{u.event.ticker}</td>
                      <td>
                        <span
                          className="text-[10px] tracking-widest"
                          style={{
                            color: u.event.type === "exdiv"
                              ? "hsl(var(--accent))"
                              : "hsl(var(--primary))",
                          }}
                        >
                          {u.event.type === "exdiv" ? "EX-DIV" : "PAYMENT"}
                          {u.event.predicted && <span className="text-muted-foreground ml-1">*</span>}
                        </span>
                      </td>
                      <td className="tabular-nums">
                        {new Date(u.date + "T12:00:00").toLocaleDateString("en-CA", {
                          month: "short", day: "numeric",
                        })}
                      </td>
                      <td className="text-right tabular-nums">
                        {u.event.amount
                          ? `${u.event.currency === "CAD" ? "C$" : "$"}${fmt2(u.event.amount)}`
                          : "—"}
                      </td>
                      <td className="text-right tabular-nums text-primary hidden sm:table-cell">
                        {u.event.amount && u.event.sharesHeld > 0
                          ? `${u.event.currency === "CAD" ? "C$" : "$"}${fmt2(u.event.amount * u.event.sharesHeld)}`
                          : "—"}
                      </td>
                      <td className="text-muted-foreground hidden sm:table-cell">
                        {portfolio}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Summary cards */}
      {events.length > 0 && (
        <div>
          <div className="text-xs tracking-widest text-accent mb-3">
            DIVIDEND HOLDINGS — {events.length} STOCKS
          </div>
          <div className="grid grid-cols-1 gap-2">
            {events
              .filter((e) => e.annualDividend && e.annualDividend > 0)
              .sort((a, b) => (b.dividendYield ?? 0) - (a.dividendYield ?? 0))
              .map((e) => (
                <div
                  key={e.ticker}
                  className="flex items-center justify-between border border-border bg-card px-3 py-2"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-xs">{e.ticker}</span>
                    <span className="text-muted-foreground text-[11px] truncate max-w-[120px]">
                      {e.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-right text-[11px]">
                    {e.frequency && (
                      <span className="text-muted-foreground hidden sm:inline">
                        {FREQ_LABEL[e.frequency] ?? `${e.frequency}×/YR`}
                      </span>
                    )}
                    {e.annualDividend && (
                      <span className="tabular-nums">
                        {e.currency === "CAD" ? "C$" : "$"}{fmt2(e.annualDividend)}/yr
                      </span>
                    )}
                    {e.dividendYield != null && (
                      <span className="text-positive tabular-nums">
                        {(e.dividendYield * 100).toFixed(2)}%
                      </span>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
