"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function AboutSettingsPage() {
  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/settings" className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors">
          <ArrowLeft className="w-4 h-4 text-gray-600" />
        </Link>
        <h1 className="text-lg font-semibold text-gray-900">About</h1>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-1">DividendTracker</h2>
          <p className="text-sm text-gray-500 mb-4">Rebuild phase</p>
        </div>

        <div className="border-t border-gray-100 divide-y divide-gray-100">
          <div className="px-4 py-3 flex justify-between">
            <span className="text-sm text-gray-500">Mode</span>
            <span className="text-sm text-gray-900">Excel-free rebuild</span>
          </div>
          <div className="px-4 py-3 flex justify-between">
            <span className="text-sm text-gray-500">Stack</span>
            <span className="text-sm text-gray-900">Next.js + Prisma + PostgreSQL</span>
          </div>
          <div className="px-4 py-3 flex justify-between">
            <span className="text-sm text-gray-500">Planned inputs</span>
            <span className="text-sm text-gray-900">Manual / Questrade API</span>
          </div>
        </div>
      </div>
    </div>
  );
}
