/**
 * Finance — transactions, balance, and a live animated donut of spending
 * by category (restored from the prototype, ₹ formatting, tabular numbers).
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Loader2, Pencil, Plus, Trash2, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { financeApi } from "@/services/api-services";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Dialog, Select } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { cn, formatDate } from "@/lib/utils";
import { ChartCard, TrendBars } from "@/components/charts/charts";
import { comparePeriods, dailyTotals } from "@/components/charts/chart-maths";

const CATEGORIES = [
  "Food", "Housing", "Transport", "Supplies", "Health", "Fun", "Income", "Other",
];
// Income is a transaction kind, not something you set a spending limit on.
const BUDGET_CATEGORIES = CATEGORIES.filter((c) => c !== "Income");
const DONUT_COLORS = [
  "var(--chart-1)", "var(--chart-2)", "var(--chart-3)",
  "var(--chart-4)", "var(--chart-5)", "var(--chart-6)",
];

// Budgets are always for the current calendar month — the same rule the
// summary uses — so the first of this month is every key we write and delete.
const monthStart = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
};

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export default function Finance() {
  const qc = useQueryClient();
  const { error: toastError, success } = useToast();
  const [editing, setEditing] = useState(null); // null | 'new' | transaction
  const [form, setForm] = useState({ title: "", amount: "", kind: "expense", category: "Food", spent_on: "", note: "" });

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["finance", "transactions"],
    queryFn: () => financeApi.transactions(120),
  });
  const { data: summary } = useQuery({
    queryKey: ["finance", "summary"],
    queryFn: () => financeApi.summary(30),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["finance"] });
  };

  const saveTx = useMutation({
    mutationFn: (body) => (editing && editing !== "new" ? financeApi.update(editing.id, body) : financeApi.create(body)),
    onSuccess: () => {
      invalidate();
      success(editing === "new" || !editing ? "Transaction added." : "Transaction updated.");
      closeDialog();
    },
    onError: (e) => toastError(e.message || "Could not save that transaction."),
  });

  const removeTx = useMutation({
    mutationFn: (id) => financeApi.delete(id),
    onSuccess: () => {
      invalidate();
      success("Transaction deleted.");
    },
    onError: (e) => toastError(e.message || "Could not delete that transaction."),
  });

  // Budgets are a per-month notion, so every budget
  // write targets the current calendar month.
  const [budgetDialog, setBudgetDialog] = useState(false);
  const [budgetForm, setBudgetForm] = useState({ category: "Food", limit: "" });

  const saveBudget = useMutation({
    mutationFn: (body) => financeApi.budgets.upsert(body),
    onSuccess: () => {
      invalidate();
      setBudgetDialog(false);
      success("Budget saved.");
    },
    onError: (e) => toastError(e.message || "Could not save that budget."),
  });

  const removeBudget = useMutation({
    mutationFn: (category) => financeApi.budgets.delete(category, monthStart()),
    onSuccess: () => {
      invalidate();
      success("Budget removed.");
    },
    onError: (e) => toastError(e.message || "Could not remove that budget."),
  });

  const openBudget = (category) => {
    const existing = summary?.budgets?.find((b) => b.category === category);
    setBudgetForm({
      category,
      limit: existing ? String(existing.limit_amount) : "",
    });
    setBudgetDialog(true);
  };

  const submitBudget = () => {
    const limit = Number(budgetForm.limit);
    if (!Number.isFinite(limit) || limit <= 0) return;
    saveBudget.mutate({
      category: budgetForm.category,
      month: monthStart(),
      limit_amount: limit,
    });
  };

  const budgetLimitValid = Number.isFinite(Number(budgetForm.limit)) && Number(budgetForm.limit) > 0;

  const openNew = () => {
    setForm({ title: "", amount: "", kind: "expense", category: "Food", spent_on: "", note: "" });
    setEditing("new");
  };
  const openEdit = (tx) => {
    setForm({
      title: tx.title,
      amount: String(tx.amount),
      kind: tx.kind,
      category: tx.category,
      spent_on: tx.spent_on,
      note: tx.note || "",
    });
    setEditing(tx);
  };
  const closeDialog = () => setEditing(null);

  // Keyboard shortcuts: "n" opens a new transaction dialog, Escape closes any open dialog
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
      if (e.key === "Escape") {
        setEditing(null);
        setBudgetDialog(false);
      }
      if (e.key === "n" && !e.metaKey && !e.ctrlKey) {
        setForm({ title: "", amount: "", kind: "expense", category: "Food", spent_on: "", note: "" });
        setEditing("new");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const submit = (e) => {
    e.preventDefault();
    const amount = Number(form.amount);
    if (!form.title.trim() || !Number.isFinite(amount) || amount < 0) return;
    saveTx.mutate({
      title: form.title.trim(),
      amount,
      kind: form.kind,
      category: form.kind === "income" ? "Income" : form.category,
      spent_on: form.spent_on || undefined,
      note: form.note,
    });
  };

  const donut = useMemo(() => buildDonut(summary?.by_category ?? []), [summary]);
  const recent = transactions.slice(0, 30);

  // Real spending trend: 30 zero-filled days split into the last 15 vs the
  // 15 before. pct is null when there is no honest baseline (first-ever
  // spending), so the card says "no comparison" instead of inventing a number.
  const spend30 = useMemo(() => dailyTotals(transactions, { days: 30, kind: "expense" }), [transactions]);
  const spendPct = useMemo(() => comparePeriods(spend30).pct, [spend30]);
  const hasSpend = spend30.some((d) => d.value > 0);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Finance</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Track spending, see where it goes (last 30 days).</p>
        </div>
        <Button onClick={openNew}>
          <Plus className="size-4" /> Add transaction
        </Button>
      </div>

      {/* Per-category monthly budgets */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Budgets</CardTitle>
          <Button variant="outline" size="sm" onClick={() => openBudget("Food")}>
            <Plus className="size-3.5" /> Set budget
          </Button>
        </CardHeader>
        <CardContent>
          {(summary?.budgets?.length ?? 0) === 0 ? (
            <p className="text-xs text-muted-foreground">No budgets set. Set a monthly limit for a category to track it here.</p>
          ) : (
            <ul className="space-y-3">
              {summary.budgets.map((b) => {
                const pct = b.limit_amount > 0 ? Math.min(100, (b.spent / b.limit_amount) * 100) : 0;
                const tone = b.status === "over" ? "bg-danger" : b.status === "near" ? "bg-warning" : "bg-success";
                return (
                  <li key={b.category}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openBudget(b.category)}
                          title="Edit this budget"
                          className="rounded-md px-1 py-0.5 text-left transition-colors hover:bg-surface-2"
                        >
                          {b.category}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm(`Remove the ${b.category} budget for this month?`)) {
                              removeBudget.mutate(b.category);
                            }
                          }}
                          aria-label={`Remove ${b.category} budget`}
                          title="Remove budget"
                          className="rounded-md p-1 text-muted-foreground transition-colors hover:text-destructive"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        {inr.format(b.spent)} / {inr.format(b.limit_amount)}
                      </span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2">
                      <div className={cn("h-full rounded-full", tone)} style={{ width: `${pct}%` }} />
                    </div>
                    <div className="mt-0.5 flex items-center justify-between text-[11px] text-muted-foreground">
                      {b.status === "over"
                        ? `Over by ${inr.format(b.spent - b.limit_amount)}`
                        : b.status === "near"
                          ? "Close to the limit"
                          : "On track"}
                      <span>{Math.round((b.spent / b.limit_amount) * 100)}%</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryCard label="Balance" value={summary?.balance ?? 0} icon={Wallet} tone="text-primary" />
        <SummaryCard label="Income" value={summary?.income ?? 0} icon={TrendingUp} tone="text-success" />
        <SummaryCard label="Expenses" value={summary?.expense ?? 0} icon={TrendingDown} tone="text-danger" delta={spendPct} />
      </div>

      {/* Spending trend — real daily totals, gap-free */}
      <ChartCard
        title="Spending trend"
        description="Expense per day, last 30 days"
        isEmpty={!hasSpend}
        emptyMessage="No expenses yet — add one to see your trend here."
      >
        <TrendBars data={spend30} height={120} format={(v) => `₹${v}`} caption="Expense per day, last 30 days" />
      </ChartCard>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        {/* Transactions */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Recent transactions</CardTitle>
            <span className="text-xs text-muted-foreground">{transactions.length} in 120 days</span>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {isLoading && (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {!isLoading && recent.length === 0 && (
              <div className="py-10 text-center text-sm text-muted-foreground">
                No transactions yet — add your first one.
              </div>
            )}
            {recent.map((tx) => (
              <div
                key={tx.id}
                className="group flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2 transition-colors hover:bg-surface-2"
              >
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                    tx.kind === "income" ? "bg-success-bg text-success" : "bg-surface-2 text-muted-foreground"
                  )}
                  aria-hidden
                >
                  {tx.category.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{tx.title}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {tx.category} · {formatDate(tx.spent_on)}
                  </p>
                </div>
                <span
                  className={cn(
                    "text-sm font-semibold tabular-nums",
                    tx.kind === "income" ? "text-success" : "text-foreground"
                  )}
                >
                  {tx.kind === "income" ? "+" : "−"}
                  {inr.format(tx.amount)}
                </span>
                <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <Button variant="ghost" size="icon-sm" aria-label="Edit transaction" onClick={() => openEdit(tx)}>
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Delete transaction"
                    onClick={() => removeTx.mutate(tx.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Donut */}
        <Card>
          <CardHeader>
            <CardTitle>By category</CardTitle>
          </CardHeader>
          <CardContent>
            {(summary?.by_category?.length ?? 0) === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Add expenses to see your breakdown.
              </p>
            ) : (
              <>
                <Donut slices={donut} total={summary?.expense ?? 0} />
                <ul className="mt-4 space-y-1.5">
                  {summary.by_category.map((c, i) => (
                    <li key={c.category} className="flex items-center gap-2 text-sm">
                      <span
                        className="size-2.5 rounded-full"
                        style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }}
                        aria-hidden
                      />
                      <span className="flex-1 truncate">{c.category}</span>
                      <span className="tabular-nums text-muted-foreground">{Math.round(c.share * 100)}%</span>
                      <span className="tabular-nums font-medium">{inr.format(c.total)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add / edit dialog */}
      <Dialog
        open={editing !== null}
        onClose={closeDialog}
        title={editing === "new" ? "Add transaction" : "Edit transaction"}
        footer={
          <>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button onClick={submit} disabled={saveTx.isPending || !form.title.trim() || !form.amount}>
              {saveTx.isPending && <Loader2 className="size-4 animate-spin" />} Save
            </Button>
          </>
        }
      >
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="tx-title">Title</Label>
            <Input
              id="tx-title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Cafecito latte"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="tx-amount">Amount (₹)</Label>
              <Input
                id="tx-amount"
                type="number"
                min="0"
                step="1"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="180"
                className="tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tx-kind">Type</Label>
              <select
                id="tx-kind"
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value })}
                className="h-9 w-full rounded-lg border border-input bg-card px-3 text-sm"
              >
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="tx-cat">Category</Label>
              <select
                id="tx-cat"
                value={form.kind === "income" ? "Income" : form.category}
                disabled={form.kind === "income"}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="h-9 w-full rounded-lg border border-input bg-card px-3 text-sm disabled:opacity-60"
              >
                {(form.kind === "income" ? ["Income", ...CATEGORIES.filter((c) => c !== "Income")] : CATEGORIES).map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tx-date">Date</Label>
              <Input
                id="tx-date"
                type="date"
                value={form.spent_on}
                onChange={(e) => setForm({ ...form, spent_on: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tx-note">Note (optional)</Label>
            <Input
              id="tx-note"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="With friends"
            />
          </div>
        </form>
      </Dialog>

      {/* Set / edit budget dialog */}
      <Dialog
        open={budgetDialog}
        onClose={() => setBudgetDialog(false)}
        title="Set a monthly budget"
        description="Budgets apply to the current calendar month. Saving replaces any limit already set for this category."
        footer={
          <>
            <Button variant="outline" onClick={() => setBudgetDialog(false)}>Cancel</Button>
            <Button onClick={submitBudget} disabled={saveBudget.isPending || !budgetLimitValid}>
              {saveBudget.isPending && <Loader2 className="size-4 animate-spin" />} Save budget
            </Button>
          </>
        }
      >
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            submitBudget();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="budget-category">Category</Label>
            <Select
              id="budget-category"
              value={budgetForm.category}
              onValueChange={(category) => setBudgetForm((f) => ({ ...f, category }))}
              options={BUDGET_CATEGORIES.map((c) => ({ value: c, label: c }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="budget-limit">Monthly limit</Label>
            <Input
              id="budget-limit"
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              value={budgetForm.limit}
              onChange={(e) => setBudgetForm((f) => ({ ...f, limit: e.target.value }))}
              placeholder="5000"
              autoFocus
            />
            {!budgetLimitValid && budgetForm.limit !== "" ? (
              <p className="text-xs text-destructive">Enter an amount greater than zero.</p>
            ) : null}
          </div>
        </form>
      </Dialog>
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon, tone, delta }) {
  return (
    <Card className="p-4 transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className={cn("size-3.5", tone)} aria-hidden />
        {label}
      </div>
      <div className="mt-1.5 text-2xl font-bold tabular-nums tracking-tight">
        {inr.format(value)}
      </div>
      {typeof delta === "number" ? (
        <div className="mt-1 flex items-center gap-1 text-[11px]">
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-medium tabular-nums",
              delta > 0 ? "bg-danger/10 text-danger" : delta < 0 ? "bg-success-bg text-success" : "bg-surface-2 text-muted-foreground"
            )}
          >
            <TrendingUp className={cn("size-3", delta < 0 && "rotate-180")} aria-hidden />
            {Math.abs(delta)}%
          </span>
          <span className="text-muted-foreground">vs previous 15 days</span>
        </div>
      ) : null}
    </Card>
  );
}

/** Convert category slices to SVG donut segment paths. */
function buildDonut(slices) {
  const total = slices.reduce((s, c) => s + c.total, 0);
  if (!total) return [];
  let angle = -90;
  return slices.map((c, i) => {
    const sweep = (c.total / total) * 360;
    const seg = { ...c, start: angle, end: angle + sweep, color: DONUT_COLORS[i % DONUT_COLORS.length] };
    angle += sweep;
    return seg;
  });
}

function Donut({ slices, total }) {
  const size = 180;
  const r = 70;
  const stroke = 26;
  const c = 2 * Math.PI * r;

  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Spending by category">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
        {slices.map((s, i) => {
          const frac = (s.end - s.start) / 360;
          return (
            <motion.circle
              key={s.category}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={stroke}
              strokeLinecap="butt"
              strokeDasharray={`${c * frac} ${c}`}
              initial={{ strokeDashoffset: c * 0.25, opacity: 0 }}
              animate={{ strokeDashoffset: -c * slices.slice(0, i).reduce((acc, x) => acc + (x.end - x.start) / 360, 0), opacity: 1 }}
              transition={{ duration: 0.7, ease: "easeOut", delay: i * 0.06 }}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[11px] text-muted-foreground">Spent</span>
        <span className="text-lg font-bold tabular-nums">{inr.format(total)}</span>
      </div>
    </div>
  );
}
