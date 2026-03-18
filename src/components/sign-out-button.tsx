"use client";

import { LogOut } from "lucide-react";

export function SignOutButton() {
  return (
    <form action="/api/auth/signout" method="POST">
      <button
        type="submit"
        className="btn-retro p-1 text-muted-foreground hover:text-foreground"
        title="Sign out"
      >
        <LogOut size={14} />
      </button>
    </form>
  );
}
