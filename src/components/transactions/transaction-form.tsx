"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TRANSACTION_TYPES, type TransactionType } from "@/types";
import {
  createTransactionSchema,
  type CreateTransactionInput,
} from "@/lib/validations/transaction";

interface Account {
  id: string;
  name: string;
  broker: string;
  currency: string;
}

interface TransactionFormProps {
  accounts: Account[];
  defaultTicker?: string;
  defaultAccountId?: string;
  onSuccess?: () => void;
}

export function TransactionForm({
  accounts,
  defaultTicker = "",
  defaultAccountId,
  onSuccess,
}: TransactionFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
    reset,
  } = useForm<CreateTransactionInput>({
    resolver: zodResolver(createTransactionSchema),
    defaultValues: {
      ticker: defaultTicker,
      accountId: defaultAccountId || accounts[0]?.id,
      type: "BUY",
      quantity: 0,
      price: 0,
      fee: 0,
      tradeDate: new Date(),
    },
  });

  const selectedType = watch("type");

  const onSubmit = async (data: CreateTransactionInput) => {
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create transaction");
      }

      reset();
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {error && (
        <div className="p-3 text-sm text-red-600 bg-red-50 rounded-lg">
          {error}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="accountId">Account</Label>
        <Select
          defaultValue={defaultAccountId || accounts[0]?.id}
          onValueChange={(v) => setValue("accountId", v)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select account" />
          </SelectTrigger>
          <SelectContent>
            {accounts.map((account) => (
              <SelectItem key={account.id} value={account.id}>
                {account.name} ({account.currency})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.accountId && (
          <p className="text-sm text-red-600">{errors.accountId.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="type">Type</Label>
        <Select
          defaultValue="BUY"
          onValueChange={(v) => setValue("type", v as TransactionType)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TRANSACTION_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {type.replace("_", " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="ticker">Ticker</Label>
        <Input
          {...register("ticker")}
          placeholder="AAPL"
          className="uppercase"
        />
        {errors.ticker && (
          <p className="text-sm text-red-600">{errors.ticker.message}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="quantity">
            {selectedType === "SPLIT" ? "Split Ratio" : "Quantity"}
          </Label>
          <Input
            {...register("quantity", { valueAsNumber: true })}
            type="number"
            step="0.0001"
            placeholder="0"
          />
          {errors.quantity && (
            <p className="text-sm text-red-600">{errors.quantity.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="price">
            {selectedType === "DIVIDEND_CASH" || selectedType === "DIVIDEND_DRIP"
              ? "Dividend/Share"
              : "Price/Share"}
          </Label>
          <Input
            {...register("price", { valueAsNumber: true })}
            type="number"
            step="0.01"
            placeholder="0.00"
          />
          {errors.price && (
            <p className="text-sm text-red-600">{errors.price.message}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="fee">Fee</Label>
          <Input
            {...register("fee", { valueAsNumber: true })}
            type="number"
            step="0.01"
            placeholder="0.00"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="tradeDate">Trade Date</Label>
          <Input
            {...register("tradeDate", { valueAsDate: true })}
            type="date"
            defaultValue={format(new Date(), "yyyy-MM-dd")}
          />
          {errors.tradeDate && (
            <p className="text-sm text-red-600">{errors.tradeDate.message}</p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="note">Note (optional)</Label>
        <Input {...register("note")} placeholder="Add a note..." />
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Saving..." : "Add Transaction"}
      </Button>
    </form>
  );
}
