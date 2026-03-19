import { signOut, auth } from "@/auth";

export default async function PendingPage() {
  const session = await auth();

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "hsl(var(--background))" }}
    >
      {/* Scanline overlay */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.08) 2px, rgba(0,0,0,0.08) 4px)",
        }}
      />

      <div className="relative z-10 border border-border bg-card p-10 w-full max-w-sm space-y-8">
        <div className="text-center space-y-2">
          <div
            className="text-xl tracking-widest font-medium"
            style={{ color: "hsl(var(--primary))" }}
          >
            ▶ DIVIDEND TRACKER
          </div>
          <div
            className="text-xs tracking-widest"
            style={{ color: "hsl(var(--muted-foreground))" }}
          >
            ACCESS PENDING
          </div>
        </div>

        <div className="border-t border-border" />

        <div className="space-y-4 text-center">
          <div className="text-[10px] tracking-widest" style={{ color: "hsl(var(--accent))" }}>
            ⧖ AWAITING APPROVAL
          </div>
          <div className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
            Your account is pending admin approval.
          </div>
          {session?.user?.email && (
            <div className="text-[10px] font-mono" style={{ color: "hsl(var(--muted-foreground))" }}>
              {session.user.email}
            </div>
          )}
          <div className="text-[10px]" style={{ color: "hsl(var(--muted-foreground))" }}>
            Please contact the admin to get access.
          </div>
        </div>

        <div className="border-t border-border" />

        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button
            type="submit"
            className="btn-retro w-full py-2 tracking-widest text-xs"
          >
            [ SIGN OUT ]
          </button>
        </form>
      </div>
    </div>
  );
}
