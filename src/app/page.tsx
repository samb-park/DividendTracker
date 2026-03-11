import Link from "next/link";

const cards = [
  {
    title: "Transactions",
    description: "Add and manage your investment ledger manually.",
    href: "/transactions",
  },
  {
    title: "Accounts",
    description: "Create and manage accounts without any spreadsheet dependency.",
    href: "/accounts",
  },
  {
    title: "Settings",
    description: "Configure app behavior and prepare for targets/API sync.",
    href: "/settings",
  },
];

export default function HomePage() {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <div className="text-xs font-semibold tracking-wider text-[#0a8043] uppercase mb-2">
          Rebuild Mode
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-3">DividendTracker</h1>
        <p className="text-gray-600 max-w-2xl">
          This app is being rebuilt as an Excel-free portfolio tracker. The current focus is a clean
          manual-first foundation: accounts, transactions, targets, and eventually broker sync.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {cards.map((card) => (
          <Link key={card.href} href={card.href} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:border-green-200 hover:shadow-md transition-all">
            <div className="text-lg font-semibold text-gray-900 mb-2">{card.title}</div>
            <div className="text-sm text-gray-600">{card.description}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
