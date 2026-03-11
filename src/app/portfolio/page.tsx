export default function PortfolioPage() {
  return (
    <div className="space-y-4 md:space-y-6">
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-gray-100 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-5 md:p-7">
          <div className="text-[11px] font-semibold tracking-[0.22em] text-[#0a8043] uppercase mb-2">Portfolio</div>
          <h1 className="text-3xl md:text-4xl font-semibold text-gray-900 dark:text-white">Portfolio</h1>
          <p className="mt-3 text-sm md:text-base text-gray-600 dark:text-slate-400 max-w-2xl">
            Combined and account-level portfolio views will live here. This page will become the main place to inspect positions, weights, and next contribution decisions.
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-gray-200 dark:border-slate-800 p-8 text-center text-gray-500 dark:text-slate-400">
        Portfolio detail is the next major build step.
      </div>
    </div>
  );
}
