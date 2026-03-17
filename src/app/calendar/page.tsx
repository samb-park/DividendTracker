import { CalendarClient } from "@/components/calendar-client";

export const dynamic = "force-dynamic";

export default function CalendarPage() {
  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-amber-400 font-medium tracking-widest">DIVIDEND CALENDAR</h1>
        <span className="text-muted-foreground text-xs">//</span>
        <span className="text-xs text-muted-foreground">EX-DIV &amp; PAYMENT DATES</span>
      </div>
      <CalendarClient />
    </div>
  );
}
