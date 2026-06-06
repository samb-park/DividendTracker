import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSingleUserId } from "@/lib/single-user-mode";
import { computeTickerDates, torontoToday } from "@/lib/pocket-dividend-dates";
import webpush from "web-push";

export const dynamic = "force-dynamic";

/**
 * POST /api/cron/dividend-events — same-day Ex/Pay Web Push (n8n, ~08:00 Toronto).
 *
 * Auth: its OWN Bearer CRON_SECRET check (proxy.ts is not active middleware; the
 * only real gate is per-route, as /api/cron/snapshot does).
 *
 * Gating: same-day alerts fire ONLY on dateConfirmed===true (a source-published
 * future ex-date). Estimated "~" tickers roll a past anchor forward by whole
 * months → a coincidental day-of-month, not the real ex-date — alerting on that
 * would notify on the wrong day. They auto-join once the source confirms.
 *
 * Dedup: per event-type Setting key = today's Toronto date, STAMPED ONLY AFTER a
 * send succeeds, so a transient failure (n8n retry) can still resend rather than
 * being silently suppressed. The web-push `tag` is the visible-dedup layer.
 */
export async function POST(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) {
    return NextResponse.json({ error: "VAPID not configured" }, { status: 500 });
  }

  const userId = getSingleUserId();
  const today = torontoToday();

  const [exS, payS] = await Promise.all([
    prisma.setting.findUnique({ where: { key: `${userId}:pocket-notify:ex` } }),
    prisma.setting.findUnique({ where: { key: `${userId}:pocket-notify:pay` } }),
  ]);
  const exEnabled = exS?.value === "true";
  const payEnabled = payS?.value === "true";
  if (!exEnabled && !payEnabled) return NextResponse.json({ ok: true, skipped: "both_disabled" });

  const [exSent, paySent] = await Promise.all([
    prisma.setting.findUnique({ where: { key: `${userId}:pocket-notify:lastSent:ex` } }),
    prisma.setting.findUnique({ where: { key: `${userId}:pocket-notify:lastSent:pay` } }),
  ]);
  const doEx = exEnabled && exSent?.value !== today;
  const doPay = payEnabled && paySent?.value !== today;
  if (!doEx && !doPay) return NextResponse.json({ ok: true, skipped: "already_sent_today" });

  // Active holdings → unique (ticker, currency); mirror run-rate's quantity>0 filter
  // so the alert set matches exactly what the user sees in the Upcoming tab.
  const holdings = await prisma.holding.findMany({
    where: { portfolio: { userId } },
    include: { portfolio: true },
  });
  const tickerCurrency = new Map<string, string>();
  for (const h of holdings) {
    if ((parseFloat(h.quantity?.toString() ?? "0") || 0) <= 0) continue;
    if (!tickerCurrency.has(h.ticker)) tickerCurrency.set(h.ticker, h.currency);
  }

  const exHoldings: string[] = [];
  const payHoldings: string[] = [];
  for (const [ticker, currency] of tickerCurrency) {
    const d = await computeTickerDates(ticker, currency);
    if (!d || !d.dateConfirmed) continue; // confirmed-only
    if (doEx && d.nextExDate === today) exHoldings.push(ticker);
    if (doPay && d.nextPayDate === today) payHoldings.push(ticker);
  }

  const notifications: { title: string; body: string; tag: string; kind: "ex" | "pay" }[] = [];
  if (exHoldings.length) {
    notifications.push({
      title: "Ex-Dividend Today",
      body: `${exHoldings.join(", ")} go ex-dividend today.`,
      tag: `ex-${today}`,
      kind: "ex",
    });
  }
  if (payHoldings.length) {
    notifications.push({
      title: "Dividend Pays Today",
      body: `Payment from ${payHoldings.join(", ")} today.`,
      tag: `pay-${today}`,
      kind: "pay",
    });
  }
  if (!notifications.length) return NextResponse.json({ ok: true, skipped: "no_events_today" });

  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  if (!subs.length) return NextResponse.json({ ok: true, skipped: "no_subscriptions" });

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  const toDelete: string[] = [];
  let anyExOk = false;
  let anyPayOk = false;
  await Promise.allSettled(
    subs.flatMap((s) =>
      notifications.map(async (n) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            JSON.stringify({ title: n.title, body: n.body, tag: n.tag }),
            { timeout: 10000 }
          );
          if (n.kind === "ex") anyExOk = true;
          else anyPayOk = true;
        } catch (err) {
          const code = (err as { statusCode?: number })?.statusCode ?? 0;
          if (code === 404 || code === 410) toDelete.push(s.endpoint); // prune dead
          // 5xx/timeout: leave in place, do NOT mark ok → dedup stays unstamped → retry works
        }
      })
    )
  );

  if (toDelete.length) {
    await prisma.pushSubscription.deleteMany({ where: { endpoint: { in: toDelete } } });
  }

  // Stamp dedup ONLY after ≥1 success for that event-type.
  const stampOps: Promise<unknown>[] = [];
  const stamp = (kind: "ex" | "pay") =>
    prisma.setting.upsert({
      where: { key: `${userId}:pocket-notify:lastSent:${kind}` },
      update: { value: today },
      create: { key: `${userId}:pocket-notify:lastSent:${kind}`, value: today },
    });
  if (anyExOk) stampOps.push(stamp("ex"));
  if (anyPayOk) stampOps.push(stamp("pay"));
  if (stampOps.length) await Promise.all(stampOps);

  return NextResponse.json({
    ok: true,
    date: today,
    exHoldings,
    payHoldings,
    subscriptions: subs.length,
    pruned: toDelete.length,
  });
}
