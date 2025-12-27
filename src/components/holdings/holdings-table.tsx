"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { HoldingWithPrice } from "@/types";

export type ColumnKey =
  | "shares"
  | "avgCost"
  | "price"
  | "value"
  | "pl"
  | "weight"
  | "52wHigh"
  | "52wLow"
  | "yield";

export interface ColumnConfig {
  key: ColumnKey;
  label: string;
  shortLabel?: string;
}

export const ALL_COLUMNS: ColumnConfig[] = [
  { key: "shares", label: "Shares" },
  { key: "avgCost", label: "Avg Cost" },
  { key: "price", label: "Price" },
  { key: "value", label: "Value" },
  { key: "pl", label: "P/L" },
  { key: "weight", label: "Weight", shortLabel: "%" },
  { key: "52wHigh", label: "52W High" },
  { key: "52wLow", label: "52W Low" },
  { key: "yield", label: "Yield" },
];

interface HoldingsTableProps {
  holdings: HoldingWithPrice[];
  onRowClick?: (ticker: string) => void;
  visibleColumns: Set<ColumnKey>;
  onToggleColumn: (key: ColumnKey) => void;
}

export function HoldingsTable({
  holdings,
  onRowClick,
  visibleColumns,
  onToggleColumn,
}: HoldingsTableProps) {
  if (holdings.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>No holdings yet</p>
        <p className="text-sm mt-1">Add a transaction to get started</p>
      </div>
    );
  }

  const isVisible = (key: ColumnKey) => visibleColumns.has(key);

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Settings2 className="h-4 w-4 mr-2" />
              Columns
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>Toggle Columns</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {ALL_COLUMNS.map((col) => (
              <label
                key={col.key}
                className="flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer hover:bg-muted rounded"
              >
                <Checkbox
                  checked={isVisible(col.key)}
                  onCheckedChange={() => onToggleColumn(col.key)}
                />
                {col.label}
              </label>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ticker</TableHead>
              {isVisible("shares") && (
                <TableHead className="text-right">Shares</TableHead>
              )}
              {isVisible("avgCost") && (
                <TableHead className="text-right hidden sm:table-cell">
                  Avg Cost
                </TableHead>
              )}
              {isVisible("price") && (
                <TableHead className="text-right">Price</TableHead>
              )}
              {isVisible("value") && (
                <TableHead className="text-right hidden sm:table-cell">
                  Value
                </TableHead>
              )}
              {isVisible("pl") && (
                <TableHead className="text-right">P/L</TableHead>
              )}
              {isVisible("weight") && (
                <TableHead className="text-right hidden md:table-cell">
                  Weight
                </TableHead>
              )}
              {isVisible("52wHigh") && (
                <TableHead className="text-right hidden lg:table-cell">
                  52W High
                </TableHead>
              )}
              {isVisible("52wLow") && (
                <TableHead className="text-right hidden lg:table-cell">
                  52W Low
                </TableHead>
              )}
              {isVisible("yield") && (
                <TableHead className="text-right hidden md:table-cell">
                  Yield
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {holdings.map((holding) => {
              const isPositive = parseFloat(holding.profitLoss || "0") >= 0;
              const currentPrice = parseFloat(holding.currentPrice || "0");
              const high52 = parseFloat(holding.fiftyTwoWeekHigh || "0");
              const low52 = parseFloat(holding.fiftyTwoWeekLow || "0");

              // Calculate position relative to 52-week range
              let pricePosition: "high" | "low" | "mid" | null = null;
              if (high52 > 0 && low52 > 0 && currentPrice > 0) {
                const range = high52 - low52;
                if (range > 0) {
                  const position = (currentPrice - low52) / range;
                  if (position >= 0.9) pricePosition = "high";
                  else if (position <= 0.1) pricePosition = "low";
                  else pricePosition = "mid";
                }
              }

              return (
                <TableRow
                  key={holding.id}
                  className={cn(
                    onRowClick && "cursor-pointer hover:bg-muted/50"
                  )}
                  onClick={() => onRowClick?.(holding.ticker)}
                >
                  <TableCell>
                    <div>
                      <span className="font-medium">{holding.ticker}</span>
                      {holding.name && (
                        <p className="text-xs text-muted-foreground truncate max-w-[120px]">
                          {holding.name}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  {isVisible("shares") && (
                    <TableCell className="text-right font-mono">
                      {holding.quantity}
                    </TableCell>
                  )}
                  {isVisible("avgCost") && (
                    <TableCell className="text-right font-mono hidden sm:table-cell">
                      ${holding.avgCost}
                    </TableCell>
                  )}
                  {isVisible("price") && (
                    <TableCell className="text-right font-mono">
                      {holding.currentPrice ? `$${holding.currentPrice}` : "—"}
                    </TableCell>
                  )}
                  {isVisible("value") && (
                    <TableCell className="text-right font-mono hidden sm:table-cell">
                      {holding.marketValue ? `$${holding.marketValue}` : "—"}
                    </TableCell>
                  )}
                  {isVisible("pl") && (
                    <TableCell className="text-right">
                      {holding.profitLoss ? (
                        <div className="flex flex-col items-end">
                          <span
                            className={cn(
                              "font-mono text-sm",
                              isPositive ? "text-green-600" : "text-red-600"
                            )}
                          >
                            {isPositive ? "+" : ""}${holding.profitLoss}
                          </span>
                          {holding.profitLossPercent && (
                            <Badge
                              variant={isPositive ? "outline" : "destructive"}
                              className="text-xs mt-0.5"
                            >
                              {isPositive ? "+" : ""}
                              {holding.profitLossPercent}%
                            </Badge>
                          )}
                        </div>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  )}
                  {isVisible("weight") && (
                    <TableCell className="text-right font-mono hidden md:table-cell">
                      {holding.weight ? `${holding.weight}%` : "—"}
                    </TableCell>
                  )}
                  {isVisible("52wHigh") && (
                    <TableCell
                      className={cn(
                        "text-right font-mono hidden lg:table-cell",
                        pricePosition === "high" && "text-green-600"
                      )}
                    >
                      {holding.fiftyTwoWeekHigh
                        ? `$${holding.fiftyTwoWeekHigh}`
                        : "—"}
                    </TableCell>
                  )}
                  {isVisible("52wLow") && (
                    <TableCell
                      className={cn(
                        "text-right font-mono hidden lg:table-cell",
                        pricePosition === "low" && "text-red-600"
                      )}
                    >
                      {holding.fiftyTwoWeekLow
                        ? `$${holding.fiftyTwoWeekLow}`
                        : "—"}
                    </TableCell>
                  )}
                  {isVisible("yield") && (
                    <TableCell className="text-right font-mono hidden md:table-cell">
                      {holding.dividendYield
                        ? `${holding.dividendYield}%`
                        : "—"}
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// Mobile-friendly card view
interface HoldingsCardsProps {
  holdings: HoldingWithPrice[];
  onRowClick?: (ticker: string) => void;
  visibleColumns: Set<ColumnKey>;
}

export function HoldingsCards({
  holdings,
  onRowClick,
  visibleColumns,
}: HoldingsCardsProps) {
  if (holdings.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>No holdings yet</p>
        <p className="text-sm mt-1">Add a transaction to get started</p>
      </div>
    );
  }

  const isVisible = (key: ColumnKey) => visibleColumns.has(key);

  return (
    <div className="space-y-3">
      {holdings.map((holding) => {
        const isPositive = parseFloat(holding.profitLoss || "0") >= 0;
        return (
          <div
            key={holding.id}
            className={cn(
              "p-4 rounded-lg border bg-card",
              onRowClick && "cursor-pointer hover:bg-muted/50"
            )}
            onClick={() => onRowClick?.(holding.ticker)}
          >
            <div className="flex justify-between items-start">
              <div>
                <span className="font-bold text-lg">{holding.ticker}</span>
                {holding.name && (
                  <p className="text-xs text-muted-foreground">{holding.name}</p>
                )}
                <p className="text-sm text-muted-foreground mt-1">
                  {holding.quantity} shares @ ${holding.avgCost}
                </p>
                {isVisible("weight") && holding.weight && (
                  <p className="text-xs text-muted-foreground">
                    {holding.weight}% of portfolio
                  </p>
                )}
              </div>
              <div className="text-right">
                <p className="font-bold">
                  {holding.marketValue ? `$${holding.marketValue}` : "—"}
                </p>
                {holding.profitLoss && (
                  <p
                    className={cn(
                      "text-sm font-medium",
                      isPositive ? "text-green-600" : "text-red-600"
                    )}
                  >
                    {isPositive ? "+" : ""}${holding.profitLoss} (
                    {isPositive ? "+" : ""}
                    {holding.profitLossPercent}%)
                  </p>
                )}
                {isVisible("yield") && holding.dividendYield && (
                  <p className="text-xs text-muted-foreground">
                    Yield: {holding.dividendYield}%
                  </p>
                )}
              </div>
            </div>
            {(isVisible("52wHigh") || isVisible("52wLow")) &&
              (holding.fiftyTwoWeekHigh || holding.fiftyTwoWeekLow) && (
                <div className="mt-2 pt-2 border-t flex gap-4 text-xs text-muted-foreground">
                  {isVisible("52wLow") && holding.fiftyTwoWeekLow && (
                    <span>52W Low: ${holding.fiftyTwoWeekLow}</span>
                  )}
                  {isVisible("52wHigh") && holding.fiftyTwoWeekHigh && (
                    <span>52W High: ${holding.fiftyTwoWeekHigh}</span>
                  )}
                </div>
              )}
          </div>
        );
      })}
    </div>
  );
}
