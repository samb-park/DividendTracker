import { Suspense } from "react";
import { CalendarClient } from "@/components/calendar-client";
import { ErrorBoundary } from "@/components/error-boundary";

export const dynamic = "force-dynamic";

export default function CalendarPage() {
  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-amber-400 font-medium tracking-wide">DIVIDEND CALENDAR</h1>
      </div>
      <ErrorBoundary label="CALENDAR">
        <Suspense fallback={<div className="text-muted-foreground text-xs text-center py-12 tracking-wide">LOADING...</div>}>
          <CalendarClient />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}
