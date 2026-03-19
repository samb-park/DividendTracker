"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

interface User {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  approved: boolean;
  role: string;
  createdAt: string;
}

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    if (status === "loading") return;
    if (session?.user?.role !== "ADMIN") {
      router.replace("/");
      return;
    }
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then(setUsers)
      .finally(() => setLoading(false));
  }, [session, status, router]);

  async function updateUser(userId: string, patch: { approved?: boolean; role?: string }) {
    setUpdating(userId);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, ...patch }),
      });
      if (res.ok) {
        const updated = await res.json();
        setUsers((prev) => prev.map((u) => (u.id === updated.id ? { ...u, ...updated } : u)));
      }
    } finally {
      setUpdating(null);
    }
  }

  if (loading) {
    return (
      <div className="p-6 text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
        LOADING...
      </div>
    );
  }

  const pending = users.filter((u) => !u.approved);
  const approved = users.filter((u) => u.approved);

  return (
    <div className="p-4 space-y-6 max-w-2xl mx-auto">
      <div className="text-xs tracking-widest font-medium" style={{ color: "hsl(var(--primary))" }}>
        ▶ USER MANAGEMENT
      </div>

      {pending.length > 0 && (
        <section className="space-y-2">
          <div className="text-[10px] tracking-widest" style={{ color: "hsl(var(--accent))" }}>
            PENDING APPROVAL ({pending.length})
          </div>
          {pending.map((u) => (
            <UserRow
              key={u.id}
              user={u}
              updating={updating === u.id}
              onApprove={() => updateUser(u.id, { approved: true })}
              onReject={() => updateUser(u.id, { approved: false })}
              isSelf={u.id === session?.user?.id}
            />
          ))}
        </section>
      )}

      {pending.length === 0 && (
        <div className="text-[10px]" style={{ color: "hsl(var(--muted-foreground))" }}>
          No pending users.
        </div>
      )}

      <section className="space-y-2">
        <div className="text-[10px] tracking-widest" style={{ color: "hsl(var(--muted-foreground))" }}>
          APPROVED USERS ({approved.length})
        </div>
        {approved.map((u) => (
          <UserRow
            key={u.id}
            user={u}
            updating={updating === u.id}
            onApprove={() => updateUser(u.id, { approved: true })}
            onReject={() => updateUser(u.id, { approved: false })}
            isSelf={u.id === session?.user?.id}
          />
        ))}
      </section>
    </div>
  );
}

function UserRow({
  user,
  updating,
  onApprove,
  onReject,
  isSelf,
}: {
  user: User;
  updating: boolean;
  onApprove: () => void;
  onReject: () => void;
  isSelf: boolean;
}) {
  return (
    <div
      className="border border-border p-3 flex items-center justify-between gap-2"
      style={{ background: "hsl(var(--card))" }}
    >
      <div className="min-w-0">
        <div className="text-xs font-medium truncate">{user.email}</div>
        <div className="text-[10px]" style={{ color: "hsl(var(--muted-foreground))" }}>
          {user.name ?? "—"} · {user.role}
          {isSelf && " · YOU"}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {user.approved ? (
          !isSelf && (
            <button
              onClick={onReject}
              disabled={updating}
              className="btn-retro text-[10px] px-2 py-1"
              style={{ color: "hsl(var(--negative))" }}
            >
              {updating ? "..." : "[ REVOKE ]"}
            </button>
          )
        ) : (
          <button
            onClick={onApprove}
            disabled={updating}
            className="btn-retro btn-retro-primary text-[10px] px-2 py-1"
          >
            {updating ? "..." : "[ APPROVE ]"}
          </button>
        )}
      </div>
    </div>
  );
}
