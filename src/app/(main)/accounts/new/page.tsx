"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Key, Loader2 } from "lucide-react";
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
import { toast } from "sonner";
import { BROKERS } from "@/types";
import {
  createAccountSchema,
  type CreateAccountInput,
} from "@/lib/validations/account";
import { QuestradeConnectDialog } from "@/components/questrade/questrade-connect-dialog";

export default function NewAccountPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedBroker, setSelectedBroker] = useState<string>("QUESTRADE");
  const [isQuestradeDialogOpen, setIsQuestradeDialogOpen] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<CreateAccountInput>({
    resolver: zodResolver(createAccountSchema),
    defaultValues: {
      broker: "QUESTRADE",
      currency: "CAD",
    },
  });

  const handleBrokerChange = (value: string) => {
    setSelectedBroker(value);
    setValue("broker", value as typeof BROKERS[number]);
  };

  const onSubmit = async (data: CreateAccountInput) => {
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create account");
      }

      toast.success("Account created");
      router.push("/accounts");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-bold">Add Portfolio</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="broker">Broker</Label>
          <Select
            defaultValue="QUESTRADE"
            onValueChange={handleBrokerChange}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BROKERS.map((broker) => (
                <SelectItem key={broker} value={broker}>
                  {broker.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedBroker === "QUESTRADE" && (
          <div className="p-4 rounded-lg border bg-muted/50 space-y-3">
            <p className="text-sm text-muted-foreground">
              Connect your Questrade account to automatically import your holdings and transactions.
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsQuestradeDialogOpen(true)}
              className="w-full"
            >
              <Key className="h-4 w-4 mr-2" />
              Connect Questrade
            </Button>
          </div>
        )}

        <div className="relative">
          {selectedBroker === "QUESTRADE" && (
            <div className="flex items-center gap-4 my-4">
              <div className="flex-1 border-t" />
              <span className="text-sm text-muted-foreground">or add manually</span>
              <div className="flex-1 border-t" />
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="name">Portfolio Name</Label>
          <Input {...register("name")} placeholder="e.g., TFSA, RRSP, Margin" />
          {errors.name && (
            <p className="text-sm text-red-600">{errors.name.message}</p>
          )}
        </div>

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Creating...
            </>
          ) : (
            "Create Portfolio"
          )}
        </Button>
      </form>

      <QuestradeConnectDialog
        open={isQuestradeDialogOpen}
        onOpenChange={setIsQuestradeDialogOpen}
        onSuccess={() => {
          router.push("/accounts");
        }}
      />
    </div>
  );
}
