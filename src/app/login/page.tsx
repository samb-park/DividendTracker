import { signIn } from "@/auth";

export default function LoginPage() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-gray-100 dark:border-slate-800 shadow-sm p-8">
        <div className="text-[11px] font-semibold tracking-[0.22em] text-[#0a8043] uppercase mb-2">Google Login</div>
        <h1 className="text-3xl font-semibold text-gray-900 dark:text-white">Sign in to DividendTracker</h1>
        <p className="mt-3 text-sm text-gray-600 dark:text-slate-400">
          Use your Google account to access your portfolio data, settings, targets, and future Questrade connection.
        </p>

        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
          className="mt-6"
        >
          <button className="w-full h-11 rounded-2xl bg-[#0a8043] text-white text-sm font-medium hover:bg-[#086b39] transition-colors">
            Continue with Google
          </button>
        </form>

        <div className="mt-4 text-xs text-gray-500 dark:text-slate-500">
          For local development before Google credentials are configured, temporary bootstrap behavior may still exist in parts of the app.
        </div>
      </div>
    </div>
  );
}
