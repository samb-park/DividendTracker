"use client";

import { useState } from "react";

interface User {
  id: string;
  email: string;
  name: string | null;
  approved: boolean;
  role: string;
  createdAt: string | Date;
}

export function AdminUserList({ users: initial, currentUserId }: { users: User[]; currentUserId: string }) {
  const [users, setUsers] = useState<User[]>(initial);
  const [updating, setUpdating] = useState<string | null>(null);

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

  const pending = users.filter((u) => !u.approved);
  const approved = users.filter((u) => u.approved);

  return (
    <div className="space-y-6">
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
              onRevoke={() => updateUser(u.id, { approved: false })}
              isSelf={u.id === currentUserId}
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
            onRevoke={() => updateUser(u.id, { approved: false })}
            isSelf={u.id === currentUserId}
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
  onRevoke,
  isSelf,
}: {
  user: User;
  updating: boolean;
  onApprove: () => void;
  onRevoke: () => void;
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
              onClick={onRevoke}
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
