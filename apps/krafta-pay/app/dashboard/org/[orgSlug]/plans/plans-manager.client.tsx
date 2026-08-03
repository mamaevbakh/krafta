"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMinorAmount } from "@/lib/format";

type Plan = {
  id: string;
  name: string;
  code: string;
  amount_minor: number;
  currency: string;
  interval_count: number;
  trial_days: number;
  is_active: boolean;
  spic?: string | null;
  packageCode?: string | null;
};

type EditDraft = {
  name: string;
  code: string;
  amountMinor: string;
  currency: string;
  intervalCount: string;
  trialDays: string;
  isActive: boolean;
  spic: string;
  packageCode: string;
};

export function PlansManagerClient({ orgId }: { orgId: string }) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [amountMinor, setAmountMinor] = useState("99000");
  const [currency, setCurrency] = useState("UZS");
  const [intervalCount, setIntervalCount] = useState("1");
  const [trialDays, setTrialDays] = useState("0");
  const [isActive, setIsActive] = useState(true);
  const [spic, setSpic] = useState("");
  const [packageCode, setPackageCode] = useState("");

  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);

  async function loadPlans(targetOrgId: string) {
    if (!targetOrgId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/dashboard/plans?orgId=${encodeURIComponent(targetOrgId)}`,
        { cache: "no-store" },
      );
      const json = (await res.json().catch(() => null)) as
        | { plans?: Plan[]; error?: string }
        | null;
      if (!res.ok) throw new Error(json?.error ?? `http_${res.status}`);
      setPlans(json?.plans ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPlans(orgId);
  }, [orgId]);

  function resetCreateForm() {
    setName("");
    setCode("");
    setAmountMinor("99000");
    setCurrency("UZS");
    setIntervalCount("1");
    setTrialDays("0");
    setIsActive(true);
    setSpic("");
    setPackageCode("");
  }

  async function createPlan(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    setError(null);
    setStatusMessage(null);

    try {
      const res = await fetch("/api/dashboard/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgId,
          name,
          code,
          amountMinor: Number(amountMinor),
          currency,
          intervalCount: Number(intervalCount),
          trialDays: Number(trialDays),
          isActive,
          spic: spic.trim() || null,
          packageCode: packageCode.trim() || null,
        }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(json?.error ?? `http_${res.status}`);
      setStatusMessage("Plan created.");
      resetCreateForm();
      await loadPlans(orgId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function startEditing(plan: Plan) {
    setEditingPlanId(plan.id);
    setEditDraft({
      name: plan.name,
      code: plan.code,
      amountMinor: String(plan.amount_minor),
      currency: plan.currency,
      intervalCount: String(plan.interval_count),
      trialDays: String(plan.trial_days),
      isActive: plan.is_active,
      spic: plan.spic ?? "",
      packageCode: plan.packageCode ?? "",
    });
  }

  function cancelEditing() {
    setEditingPlanId(null);
    setEditDraft(null);
  }

  async function savePlan(planId: string) {
    if (!orgId || !editDraft) return;
    setError(null);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/dashboard/plans", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgId,
          planId,
          name: editDraft.name,
          code: editDraft.code,
          amountMinor: Number(editDraft.amountMinor),
          currency: editDraft.currency,
          intervalCount: Number(editDraft.intervalCount),
          trialDays: Number(editDraft.trialDays),
          isActive: editDraft.isActive,
          spic: editDraft.spic.trim() || null,
          packageCode: editDraft.packageCode.trim() || null,
        }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(json?.error ?? `http_${res.status}`);
      setStatusMessage("Plan updated.");
      cancelEditing();
      await loadPlans(orgId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function togglePlan(plan: Plan) {
    setError(null);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/dashboard/plans", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgId,
          planId: plan.id,
          isActive: !plan.is_active,
        }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(json?.error ?? `http_${res.status}`);
      setStatusMessage(`Plan ${!plan.is_active ? "activated" : "disabled"}.`);
      await loadPlans(orgId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function deletePlan(plan: Plan) {
    setError(null);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/dashboard/plans", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgId,
          planId: plan.id,
        }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(json?.error ?? `http_${res.status}`);
      setStatusMessage("Plan deleted.");
      if (editingPlanId === plan.id) cancelEditing();
      await loadPlans(orgId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="space-y-6">

      <form onSubmit={createPlan} className="grid gap-3 rounded-md border bg-background p-4 md:grid-cols-2">
        <div className="grid gap-1">
          <label className="text-sm font-medium" htmlFor="plan-name">
            Plan name
          </label>
          <Input id="plan-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="grid gap-1">
          <label className="text-sm font-medium" htmlFor="plan-code">
            Plan code
          </label>
          <Input id="plan-code" value={code} onChange={(e) => setCode(e.target.value)} required />
        </div>
        <div className="grid gap-1">
          <label className="text-sm font-medium" htmlFor="plan-amount">
            Amount minor
          </label>
          <Input id="plan-amount" value={amountMinor} onChange={(e) => setAmountMinor(e.target.value)} />
        </div>
        <div className="grid gap-1">
          <label className="text-sm font-medium" htmlFor="plan-currency">
            Currency
          </label>
          <Input id="plan-currency" value={currency} onChange={(e) => setCurrency(e.target.value)} />
        </div>
        <div className="grid gap-1">
          <label className="text-sm font-medium" htmlFor="plan-interval-count">
            Interval count (months)
          </label>
          <Input
            id="plan-interval-count"
            value={intervalCount}
            onChange={(e) => setIntervalCount(e.target.value)}
          />
        </div>
        <div className="grid gap-1">
          <label className="text-sm font-medium" htmlFor="plan-trial">
            Trial days
          </label>
          <Input id="plan-trial" value={trialDays} onChange={(e) => setTrialDays(e.target.value)} />
        </div>
        <div className="grid gap-1 md:col-span-2">
          <label className="text-sm font-medium" htmlFor="plan-spic">
            SPIC (IKPU)
          </label>
          <Input
            id="plan-spic"
            value={spic}
            onChange={(e) => setSpic(e.target.value)}
            placeholder="06209001001000000"
          />
        </div>
        <div className="grid gap-1 md:col-span-2">
          <label className="text-sm font-medium" htmlFor="plan-package-code">
            Package code
          </label>
          <Input
            id="plan-package-code"
            value={packageCode}
            onChange={(e) => setPackageCode(e.target.value)}
            placeholder="Catalog package code from Tasnif"
          />
        </div>
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input checked={isActive} onChange={(e) => setIsActive(e.target.checked)} type="checkbox" />
          Active
        </label>
        <div className="md:col-span-2">
          <Button type="submit">Create plan</Button>
        </div>
      </form>

      <div className="rounded-md border bg-background p-4">
        <h2 className="text-sm font-medium">Plans</h2>
        {loading ? (
          <p className="mt-3 text-sm text-muted-foreground">Loading plans...</p>
        ) : plans.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No plans yet.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {plans.map((plan) => {
              const isEditing = editingPlanId === plan.id && editDraft;
              return (
                <div key={plan.id} className="rounded-md border p-3">
                  {!isEditing ? (
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-medium">
                          {plan.name} ({plan.code})
                        </p>
                        <p className="text-xs text-muted-foreground">
                          <span className="font-mono tabular-nums">
                            {formatMinorAmount(plan.amount_minor, plan.currency)}
                          </span>{" "}
                          / {plan.interval_count} month(s) · Trial {plan.trial_days} days
                        </p>
                        <p className="text-xs text-muted-foreground">
                          SPIC: {plan.spic || "not set"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Package code: {plan.packageCode || "not set"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Status: {plan.is_active ? "active" : "disabled"}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => startEditing(plan)}>
                          Edit
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => togglePlan(plan)}>
                          {plan.is_active ? "Disable" : "Activate"}
                        </Button>
                        <Button type="button" variant="destructive" size="sm" onClick={() => deletePlan(plan)}>
                          Delete
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="grid gap-1">
                        <label className="text-xs text-muted-foreground">Name</label>
                        <Input
                          value={editDraft.name}
                          onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                        />
                      </div>
                      <div className="grid gap-1">
                        <label className="text-xs text-muted-foreground">Code</label>
                        <Input
                          value={editDraft.code}
                          onChange={(e) => setEditDraft({ ...editDraft, code: e.target.value })}
                        />
                      </div>
                      <div className="grid gap-1">
                        <label className="text-xs text-muted-foreground">Amount minor</label>
                        <Input
                          value={editDraft.amountMinor}
                          onChange={(e) => setEditDraft({ ...editDraft, amountMinor: e.target.value })}
                        />
                      </div>
                      <div className="grid gap-1">
                        <label className="text-xs text-muted-foreground">Currency</label>
                        <Input
                          value={editDraft.currency}
                          onChange={(e) => setEditDraft({ ...editDraft, currency: e.target.value })}
                        />
                      </div>
                      <div className="grid gap-1">
                        <label className="text-xs text-muted-foreground">Interval (months)</label>
                        <Input
                          value={editDraft.intervalCount}
                          onChange={(e) => setEditDraft({ ...editDraft, intervalCount: e.target.value })}
                        />
                      </div>
                      <div className="grid gap-1">
                        <label className="text-xs text-muted-foreground">Trial days</label>
                        <Input
                          value={editDraft.trialDays}
                          onChange={(e) => setEditDraft({ ...editDraft, trialDays: e.target.value })}
                        />
                      </div>
                      <div className="grid gap-1 md:col-span-2">
                        <label className="text-xs text-muted-foreground">SPIC (IKPU)</label>
                        <Input
                          value={editDraft.spic}
                          onChange={(e) => setEditDraft({ ...editDraft, spic: e.target.value })}
                          placeholder="06209001001000000"
                        />
                      </div>
                      <div className="grid gap-1 md:col-span-2">
                        <label className="text-xs text-muted-foreground">Package code</label>
                        <Input
                          value={editDraft.packageCode}
                          onChange={(e) =>
                            setEditDraft({ ...editDraft, packageCode: e.target.value })
                          }
                          placeholder="Catalog package code from Tasnif"
                        />
                      </div>
                      <label className="flex items-center gap-2 text-sm md:col-span-2">
                        <input
                          checked={editDraft.isActive}
                          onChange={(e) => setEditDraft({ ...editDraft, isActive: e.target.checked })}
                          type="checkbox"
                        />
                        Active
                      </label>
                      <div className="flex gap-2 md:col-span-2">
                        <Button type="button" size="sm" onClick={() => void savePlan(plan.id)}>
                          Save
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={cancelEditing}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {statusMessage ? (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-700">
          {statusMessage}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}
    </div>
  );
}
