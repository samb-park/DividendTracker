"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import AccountsPage from "@/app/accounts/page";

export default function AccountsSettingsPage() {
  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/settings" className="w-8 h-8 rounded-full bg-gray-100 dark:bg-slate-800 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors">
          <ArrowLeft className="w-4 h-4 text-gray-600 dark:text-slate-300" />
        </Link>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Accounts</h1>
      </div>
      <AccountsPage />
    </div>
  );
}
