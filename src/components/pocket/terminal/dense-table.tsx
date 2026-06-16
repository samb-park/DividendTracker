"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/** Column spec for the dependency-free DenseTable (ported visual/behavior from
 *  MDD terminal/DenseTable, sorting reimplemented with plain React — no
 *  @tanstack/react-table dependency). */
export interface DenseColumn<T> {
  key: string;
  header: React.ReactNode;
  align?: "left" | "right";
  /** sort comparator key; omit to make the column non-sortable */
  sortValue?: (row: T) => number | string;
  cell: (row: T) => React.ReactNode;
}

interface DenseTableProps<T> {
  columns: DenseColumn<T>[];
  data: T[];
  /** rows matching this predicate get a cyan left border (e.g. the active band) */
  highlightRow?: (row: T) => boolean;
  initialSort?: { key: string; desc: boolean };
  className?: string;
  emptyText?: string;
}

export function DenseTable<T>({
  columns,
  data,
  highlightRow,
  initialSort,
  className,
  emptyText = "NO DATA",
}: DenseTableProps<T>) {
  const [sort, setSort] = React.useState<{ key: string; desc: boolean } | null>(initialSort ?? null);

  const sorted = React.useMemo(() => {
    if (!sort) return data;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return data;
    const getv = col.sortValue;
    const rows = [...data];
    rows.sort((a, b) => {
      const av = getv(a);
      const bv = getv(b);
      let cmp: number;
      if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
      else cmp = String(av).localeCompare(String(bv));
      return sort.desc ? -cmp : cmp;
    });
    return rows;
  }, [data, sort, columns]);

  const toggleSort = (col: DenseColumn<T>) => {
    if (!col.sortValue) return;
    setSort((prev) =>
      prev && prev.key === col.key ? { key: col.key, desc: !prev.desc } : { key: col.key, desc: true },
    );
  };

  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full border-collapse font-mono text-xs tabular-nums">
        <thead>
          <tr className="sticky top-0 z-10 bg-panel-header">
            {columns.map((c) => {
              const active = sort?.key === c.key;
              return (
                <th
                  key={c.key}
                  onClick={() => toggleSort(c)}
                  className={cn(
                    "h-6 whitespace-nowrap border-b border-hairline px-2 py-0.5 text-left text-[10px] font-medium uppercase tracking-wider text-text-mid",
                    c.sortValue && "cursor-pointer select-none hover:text-text-hi",
                    c.align === "right" && "text-right",
                  )}
                >
                  {c.header}
                  {active ? (sort!.desc ? " ▼" : " ▲") : ""}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="h-12 text-center text-[10px] uppercase tracking-wider text-text-low"
              >
                {emptyText}
              </td>
            </tr>
          ) : (
            sorted.map((row, i) => (
              <tr
                key={i}
                className={cn(
                  "h-6 odd:bg-white/[0.02] hover:bg-white/[0.04]",
                  highlightRow?.(row) && "border-l-2 border-l-accent-cyan bg-accent-cyan/5",
                )}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn("whitespace-nowrap px-2 py-0.5 text-text-hi", c.align === "right" && "text-right")}
                  >
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
