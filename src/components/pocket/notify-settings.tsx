"use client";

import { useCallback, useEffect, useState } from "react";
import { PocketPanel } from "./pocket-panel";

/** Web Push is iOS-gated: installed (home-screen) PWA, iOS 16.4+, these APIs present. */
function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

function urlBase64ToUint8Array(b64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const s = (b64 + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(s);
  // Allocate a fresh ArrayBuffer-backed array (assignable to BufferSource);
  // Uint8Array.from() yields Uint8Array<ArrayBufferLike>, which is not.
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function getReg(): Promise<ServiceWorkerRegistration | undefined> {
  return navigator.serviceWorker.getRegistration();
}

export function NotifySettings() {
  const [supported, setSupported] = useState(false);
  const [ready, setReady] = useState(false); // initial reconciliation done
  const [exEnabled, setExEnabled] = useState(false);
  const [payEnabled, setPayEnabled] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [busy, setBusy] = useState(false);
  const [errMsg, setErrMsg] = useState("");

  // Load-time reconciliation: derive honest toggle state from
  // (server flags, this device's permission + actual subscription).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sup = pushSupported();
      if (!cancelled) setSupported(sup);
      try {
        const d = await (await fetch("/api/push/settings")).json();
        let flagEx = !!d.exEnabled;
        let flagPay = !!d.payEnabled;
        if (sup) {
          const perm = Notification.permission;
          const reg = await getReg();
          const sub = reg ? await reg.pushManager.getSubscription() : null;
          const has = !!sub;
          if (!cancelled) setPermission(perm);
          // Honest per-device display: a flag is only "on here" if this device can
          // actually receive (granted + a live local subscription).
          if (!has || perm !== "granted") {
            flagEx = false;
            flagPay = false;
          }
          // Stray local subscription with both flags off → tear it down.
          if (has && !d.exEnabled && !d.payEnabled) {
            await fetch("/api/push/unsubscribe", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ endpoint: sub!.endpoint }),
            });
            await sub!.unsubscribe();
          }
        }
        if (!cancelled) {
          setExEnabled(flagEx);
          setPayEnabled(flagPay);
        }
      } catch {
        /* leave defaults */
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Ensure THIS device is subscribed. Permission is the FIRST await so iOS honors
  // the originating tap gesture. Registers the SW itself (with a timeout so it can
  // never hang) and ALWAYS re-POSTs the subscription (upsert self-heals after a prune).
  const ensureSubscribed = useCallback(async (): Promise<boolean> => {
    if (Notification.permission === "default") {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        setErrMsg(
          perm === "denied"
            ? "Notifications are blocked. Enable them in iOS Settings for this app."
            : "Notification permission is required."
        );
        return false;
      }
    } else if (Notification.permission !== "granted") {
      setPermission(Notification.permission);
      setErrMsg("Notifications are blocked. Enable them in iOS Settings for this app.");
      return false;
    }

    const reg = await Promise.race([
      navigator.serviceWorker.register("/sw.js", { scope: "/" }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("Service worker timed out")), 8000)),
    ]);
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const { publicKey } = await (await fetch("/api/push/vapid-public-key")).json();
      if (!publicKey) {
        setErrMsg("Push is not configured on the server.");
        return false;
      }
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }
    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: sub.endpoint, keys: sub.toJSON().keys }),
    });
    return true;
  }, []);

  const handleToggle = useCallback(
    async (kind: "ex" | "pay", next: boolean) => {
      if (!supported || busy) return;
      setBusy(true);
      setErrMsg("");
      try {
        const willEx = kind === "ex" ? next : exEnabled;
        const willPay = kind === "pay" ? next : payEnabled;

        if (next) {
          const ok = await ensureSubscribed();
          if (!ok) return; // permission denied → leave the toggle off
        } else if (!willEx && !willPay) {
          // Both now off → tear down the shared subscription.
          const reg = await getReg();
          const sub = reg ? await reg.pushManager.getSubscription() : null;
          if (sub) {
            await fetch("/api/push/unsubscribe", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ endpoint: sub.endpoint }),
            });
            await sub.unsubscribe();
          }
        }

        await fetch("/api/push/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [kind === "ex" ? "exEnabled" : "payEnabled"]: next }),
        });
        if (kind === "ex") setExEnabled(next);
        else setPayEnabled(next);
      } catch (e) {
        setErrMsg(e instanceof Error ? e.message : "Something went wrong.");
      } finally {
        setBusy(false);
      }
    },
    [supported, busy, exEnabled, payEnabled, ensureSubscribed]
  );

  return (
    <PocketPanel title="Dividend alerts" bodyClassName="flush">
      <div className="pk-card">
        {!supported ? (
          <p className="pk-note pk-card-note">
            Add this app to your Home Screen and open it from there to enable alerts (iOS 16.4+).
          </p>
        ) : (
          <>
            <div className="pk-switch-row">
              <span className="pk-switch-label">Ex-dividend day</span>
              <button
                type="button"
                role="switch"
                aria-checked={exEnabled}
                aria-label="Ex-dividend day alerts"
                className="pk-switch"
                data-on={exEnabled}
                disabled={busy || !ready}
                onClick={() => handleToggle("ex", !exEnabled)}
              >
                <span className="pk-switch-knob" aria-hidden />
              </button>
            </div>
            <div className="pk-switch-row">
              <span className="pk-switch-label">Dividend pay day</span>
              <button
                type="button"
                role="switch"
                aria-checked={payEnabled}
                aria-label="Dividend pay day alerts"
                className="pk-switch"
                data-on={payEnabled}
                disabled={busy || !ready}
                onClick={() => handleToggle("pay", !payEnabled)}
              >
                <span className="pk-switch-knob" aria-hidden />
              </button>
            </div>
            {permission === "denied" && (
              <p className="pk-note warn pk-card-note">
                Notifications are blocked — enable them in iOS Settings for this app.
              </p>
            )}
            {errMsg && <p className="pk-note warn pk-card-note">{errMsg}</p>}
          </>
        )}
      </div>
    </PocketPanel>
  );
}
