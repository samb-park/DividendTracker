"use client";

export function SignInButton() {
  return (
    <button
      type="button"
      onClick={() => {
        window.location.href = "/api/auth/signin/google?callbackUrl=/";
      }}
      className="px-3 py-2 text-sm bg-[#0a8043] text-white rounded-xl hover:bg-[#086b39] transition-colors"
    >
      Sign in
    </button>
  );
}

export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => {
        window.location.href = "/api/auth/signout?callbackUrl=/login";
      }}
      className="px-3 py-2 text-sm border border-gray-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-950 text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
    >
      Sign out
    </button>
  );
}
