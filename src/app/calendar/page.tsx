export default function CalendarPage() {
  return (
    <div className="space-y-4 md:space-y-6">
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-gray-100 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-5 md:p-7">
          <div className="text-[11px] font-semibold tracking-[0.22em] text-[#0a8043] uppercase mb-2">Calendar</div>
          <h1 className="text-3xl md:text-4xl font-semibold text-gray-900 dark:text-white">Calendar</h1>
          <p className="mt-3 text-sm md:text-base text-gray-600 dark:text-slate-400 max-w-2xl">
            Dividend dates, payment timing, earnings, and other portfolio events will surface here.
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-gray-200 dark:border-slate-800 p-8 text-center text-gray-500 dark:text-slate-400">
        Calendar event views will be added after portfolio and data sync are in place.
      </div>
    </div>
  );
}
