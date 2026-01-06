"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function AboutSettingsPage() {
  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header with back button */}
      <div className="flex items-center gap-3">
        <Link
          href="/settings"
          className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-gray-600" />
        </Link>
        <h1 className="text-lg font-semibold text-gray-900">About</h1>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 text-center">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-[#0a8043] to-[#16a34a] flex items-center justify-center mb-4">
            <svg
              className="w-8 h-8 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-1">Portfolio Tracker</h2>
          <p className="text-sm text-gray-500 mb-4">Version 1.0.0</p>
        </div>

        <div className="border-t border-gray-100 divide-y divide-gray-100">
          <div className="px-4 py-3 flex justify-between">
            <span className="text-sm text-gray-500">Developer</span>
            <span className="text-sm text-gray-900">Personal Project</span>
          </div>
          <div className="px-4 py-3 flex justify-between">
            <span className="text-sm text-gray-500">Built with</span>
            <span className="text-sm text-gray-900">Next.js + Prisma</span>
          </div>
          <div className="px-4 py-3 flex justify-between">
            <span className="text-sm text-gray-500">Data Source</span>
            <span className="text-sm text-gray-900">Questrade Excel Export</span>
          </div>
        </div>
      </div>

      <p className="text-xs text-gray-400 px-4 text-center">
        Track your investment portfolio and dividends with ease.
      </p>
    </div>
  );
}
