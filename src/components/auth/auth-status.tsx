"use client";

import { useEffect, useState } from "react";
import { SignInButton, SignOutButton } from "@/components/auth/auth-actions";

type SessionResponse = {
  user?: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
} | null;

export function AuthStatus() {
  const [session, setSession] = useState<SessionResponse>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/session");
        setSession(await res.json());
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return <div className="text-xs text-gray-400 dark:text-slate-500">Checking login...</div>;
  }

  if (session?.user?.email) {
    return (
      <div className="flex items-center gap-3">
        <div className="text-xs text-gray-500 dark:text-slate-400 text-right">
          <div className="font-medium text-gray-900 dark:text-white">{session.user.name || "Signed in"}</div>
          <div>{session.user.email}</div>
        </div>
        <SignOutButton />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <div className="text-xs text-gray-400 dark:text-slate-500">Not signed in</div>
      <SignInButton />
    </div>
  );
}
