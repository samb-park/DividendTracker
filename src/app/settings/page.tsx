"use client";

import Link from "next/link";
import { ChevronRight, User, Info, Palette, Receipt } from "lucide-react";

const settingsItems = [
  {
    href: "/settings/accounts",
    label: "Accounts",
    description: "Manage accounts and import transactions",
    icon: User,
  },
  {
    href: "/settings/transactions",
    label: "Transactions",
    description: "View all transaction history",
    icon: Receipt,
  },
  {
    href: "/settings/display",
    label: "Display",
    description: "Currency and display preferences",
    icon: Palette,
  },
  {
    href: "/settings/about",
    label: "About",
    description: "App version and information",
    icon: Info,
  },
];

export default function SettingsPage() {
  return (
    <div className="space-y-4 md:space-y-6">
      <div className="border-b border-gray-200 mb-4">
        <span className="pb-2 text-xs font-semibold tracking-wider text-[#0a8043] border-b-[3px] border-[#0a8043] inline-block">
          SETTINGS
        </span>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {settingsItems.map((item, idx) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-4 px-4 py-4 hover:bg-gray-50 transition-colors ${
                idx !== settingsItems.length - 1 ? "border-b border-gray-100" : ""
              }`}
            >
              <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                <Icon className="w-5 h-5 text-gray-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900">{item.label}</div>
                <div className="text-xs text-gray-500 truncate">{item.description}</div>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
