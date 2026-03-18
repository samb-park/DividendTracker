import { CalendarClient } from "@/components/calendar-client";

export const dynamic = "force-dynamic";

export default function CalendarPage() {
  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-amber-400 font-medium tracking-wide">DIVIDEND CALENDAR</h1>
      </div>
      <CalendarClient />
    </div>
  );
}
