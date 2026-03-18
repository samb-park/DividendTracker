import { signIn } from "@/auth";

export default function LoginPage() {
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
            PERSONAL PORTFOLIO SYSTEM
          </div>
        </div>

        <div className="border-t border-border" />

        <div className="space-y-4">
          <div
            className="text-[10px] tracking-widest text-center"
            style={{ color: "hsl(var(--muted-foreground))" }}
          >
            AUTHENTICATION REQUIRED
          </div>
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/" });
            }}
          >
            <button
              type="submit"
              className="btn-retro btn-retro-primary w-full py-3 tracking-widest"
            >
              [ SIGN IN WITH GOOGLE ]
            </button>
          </form>
        </div>

        <div
          className="text-[10px] text-center tabular-nums"
          style={{ color: "hsl(var(--border))" }}
        >
          AUTHORIZED ACCESS ONLY
        </div>
      </div>
    </div>
  );
}
