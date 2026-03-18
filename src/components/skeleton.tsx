"use client";

export function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <div className={`bg-border/50 animate-pulse rounded-none ${className}`} />
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Account selector bar */}
      <div className="flex gap-2 pb-3 border-b border-border">
        <SkeletonBlock className="h-6 w-16" />
        <SkeletonBlock className="h-6 w-12 ml-auto" />
      </div>

      {/* Summary grid */}
      <div className="grid grid-cols-3 gap-px bg-border border border-border">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-card p-3 space-y-2">
            <SkeletonBlock className="h-2.5 w-16" />
            <SkeletonBlock className="h-4 w-20" />
          </div>
        ))}
      </div>

      {/* Performance chart placeholder */}
      <div className="border border-border bg-card p-4 space-y-3">
        <div className="flex justify-between">
          <SkeletonBlock className="h-3 w-24" />
          <div className="flex gap-1">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonBlock key={i} className="h-5 w-8" />
            ))}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-px bg-border border border-border">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-card p-2 space-y-1.5">
              <SkeletonBlock className="h-2.5 w-12" />
              <SkeletonBlock className="h-4 w-16" />
            </div>
          ))}
        </div>
        <SkeletonBlock className="h-36 w-full" />
      </div>

      {/* Allocation bars placeholder */}
      <div className="border border-border bg-card p-4 space-y-3">
        <SkeletonBlock className="h-3 w-28" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-1">
            <div className="flex justify-between">
              <SkeletonBlock className="h-2.5 w-10" />
              <SkeletonBlock className="h-2.5 w-14" />
            </div>
            <SkeletonBlock className="h-2 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
