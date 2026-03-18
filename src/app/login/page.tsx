import { signIn } from "@/auth";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="border border-border bg-card p-8 w-full max-w-xs space-y-6">
        <div className="text-center space-y-1">
          <div className="text-primary text-lg tracking-wide font-medium">▶ DIVIDEND TRACKER</div>
          <div className="text-muted-foreground text-xs tracking-wide">SIGN IN TO CONTINUE</div>
        </div>

        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            className="btn-retro btn-retro-primary w-full py-3 text-sm tracking-wide"
          >
            [ SIGN IN WITH GOOGLE ]
          </button>
        </form>
      </div>
    </div>
  );
}
