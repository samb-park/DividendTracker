"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function AboutSettingsPage() {
  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/settings" className="w-8 h-8 rounded-full bg-gray-100 dark:bg-slate-800 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors">
          <ArrowLeft className="w-4 h-4 text-gray-600 dark:text-slate-300" />
        </Link>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">About</h1>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 overflow-hidden">
        <div className="p-6 text-center">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-1">DividendTracker</h2>
          <p className="text-sm text-gray-500 dark:text-slate-400 mb-4">Rebuild phase</p>
        </div>

        <div className="border-t border-gray-100 dark:border-slate-800 divide-y divide-gray-100 dark:divide-slate-800">
          <div className="px-4 py-3 flex justify-between">
            <span className="text-sm text-gray-500 dark:text-slate-400">Mode</span>
            <span className="text-sm text-gray-900 dark:text-white">Excel-free rebuild</span>
          </div>
          <div className="px-4 py-3 flex justify-between">
            <span className="text-sm text-gray-500 dark:text-slate-400">Stack</span>
            <span className="text-sm text-gray-900 dark:text-white">Next.js + Prisma + PostgreSQL</span>
          </div>
          <div className="px-4 py-3 flex justify-between">
            <span className="text-sm text-gray-500 dark:text-slate-400">Planned inputs</span>
            <span className="text-sm text-gray-900 dark:text-white">Manual / Questrade API</span>
          </div>
        </div>
      </div>
    </div>
  );
}
