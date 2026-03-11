"use client";

import Link from "next/link";
import { ChevronRight, User, Info, Moon } from "lucide-react";
import { ThemeToggle } from "@/components/theme/theme-toggle";

const settingsItems = [
  {
    href: "/settings/accounts",
    label: "Accounts",
    description: "Manage account names and existing account records",
    icon: User,
  },
  {
    href: "/settings/about",
    label: "About",
    description: "Rebuild status and app information",
    icon: Info,
  },
];

export default function SettingsPage() {
  return (
    <div className="space-y-4 md:space-y-6">
      <div className="border-b border-gray-200 dark:border-slate-800 mb-4">
        <span className="pb-2 text-xs font-semibold tracking-wider text-[#0a8043] border-b-[3px] border-[#0a8043] inline-block">
          SETTINGS
        </span>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 overflow-hidden">
        <div className="flex items-center justify-between gap-4 px-4 py-4 border-b border-gray-100 dark:border-slate-800">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
              <Moon className="w-5 h-5 text-gray-600 dark:text-slate-300" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium text-gray-900 dark:text-white">Appearance</div>
              <div className="text-xs text-gray-500 dark:text-slate-400 truncate">Choose light, dark, or system mode</div>
            </div>
          </div>
          <ThemeToggle />
        </div>
        {settingsItems.map((item, idx) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-4 px-4 py-4 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors ${
                idx !== settingsItems.length - 1 ? "border-b border-gray-100 dark:border-slate-800" : ""
              }`}
            >
              <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
                <Icon className="w-5 h-5 text-gray-600 dark:text-slate-300" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 dark:text-white">{item.label}</div>
                <div className="text-xs text-gray-500 dark:text-slate-400 truncate">{item.description}</div>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400 dark:text-slate-500 flex-shrink-0" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
