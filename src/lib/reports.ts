import { createClient } from "@/lib/supabase/server";

export function rangeToDates(range: string): { from: Date; to: Date; days: number } {
  const days = { "7d": 7, "30d": 30, "90d": 90, "365d": 365 }[range] ?? 30;
  const to = new Date();
  const from = new Date(to.getTime() - days * 86400_000);
  return { from, to, days };
}

export interface ReportData {
  currency: string;
  range: string;
  revenue: number;
  paymentsByDay: { date: string; amount: number }[];
  paymentsByMethod: { method: string; amount: number }[];
  partsRevenue: number;
  laborRevenue: number;
  servicesRevenue: number;
  partsCost: number;
  grossProfit: number;
  outstanding: number;
  discounts: number;
  tax: number;
  jobsCheckedIn: number;
  jobsCompleted: number;
  jobsOpen: number;
  avgRepairHours: number | null;
  overdue: number;
  technicians: { name: string; jobs: number; hours: number; tasks: number }[];
  topCustomers: { name: string; spent: number; jobs: number }[];
  newCustomers: number;
  partsUsed: { name: string; qty: number; value: number }[];
  stockValue: number;
  lowStock: number;
}

export async function buildReport(garageId: string, currency: string, range: string): Promise<ReportData> {
  const supabase = await createClient();
  const { from, to } = rangeToDates(range);
  const fromIso = from.toISOString();

  const [
    { data: payments },
    { data: invoices },
    { data: woParts },
    { data: woLabor },
    { data: woServices },
    { data: wos },
    { data: members },
    { data: timeEntries },
    { data: tasks },
    { data: customers },
    { data: usageTxns },
    { data: parts },
  ] = await Promise.all([
    supabase.from("payments").select("amount, is_refund, method, created_at").eq("garage_id", garageId).gte("created_at", fromIso),
    supabase.from("invoices").select("balance, discount, tax, status, created_at").eq("garage_id", garageId),
    supabase.from("work_order_parts").select("amount, unit_cost, quantity, description, created_at").eq("garage_id", garageId).gte("created_at", fromIso),
    supabase.from("work_order_labor").select("amount, created_at").eq("garage_id", garageId).gte("created_at", fromIso),
    supabase.from("work_order_services").select("amount, created_at").eq("garage_id", garageId).gte("created_at", fromIso),
    supabase.from("work_orders").select("id, status, checked_in_at, completed_at, expected_completion").eq("garage_id", garageId),
    supabase.from("memberships").select("user_id, role").eq("garage_id", garageId).eq("status", "active"),
    supabase.from("time_entries").select("technician_id, work_order_id, duration_seconds, started_at").eq("garage_id", garageId).gte("started_at", fromIso),
    supabase.from("work_order_tasks").select("assigned_to, status, completed_at").eq("garage_id", garageId).gte("created_at", fromIso),
    supabase.from("customers").select("id, name, created_at").eq("garage_id", garageId).is("deleted_at", null),
    supabase.from("inventory_transactions").select("part_id, quantity_delta, unit_cost, type, created_at").eq("garage_id", garageId).eq("type", "use").gte("created_at", fromIso),
    supabase.from("parts").select("id, name, quantity, cost, min_stock").eq("garage_id", garageId).is("deleted_at", null),
  ]);

  const rev = (payments ?? []).reduce((t, p) => t + (p.is_refund ? -Number(p.amount) : Number(p.amount)), 0);

  const byDay = new Map<string, number>();
  (payments ?? []).forEach((p) => {
    const d = (p.created_at as string).slice(0, 10);
    byDay.set(d, (byDay.get(d) ?? 0) + (p.is_refund ? -Number(p.amount) : Number(p.amount)));
  });
  const paymentsByDay = [...byDay.entries()].sort().map(([date, amount]) => ({ date, amount }));

  const byMethod = new Map<string, number>();
  (payments ?? []).forEach((p) =>
    byMethod.set(p.method as string, (byMethod.get(p.method as string) ?? 0) + (p.is_refund ? -Number(p.amount) : Number(p.amount))),
  );
  const paymentsByMethod = [...byMethod.entries()].map(([method, amount]) => ({ method, amount }));

  const partsRevenue = (woParts ?? []).reduce((t, r) => t + Number(r.amount), 0);
  const partsCost = (woParts ?? []).reduce((t, r) => t + Number(r.unit_cost) * Number(r.quantity), 0);
  const laborRevenue = (woLabor ?? []).reduce((t, r) => t + Number(r.amount), 0);
  const servicesRevenue = (woServices ?? []).reduce((t, r) => t + Number(r.amount), 0);
  const grossProfit = partsRevenue + laborRevenue + servicesRevenue - partsCost;

  const outstanding = (invoices ?? [])
    .filter((i) => ["unpaid", "partial"].includes(i.status as string))
    .reduce((t, i) => t + Number(i.balance), 0);
  const discounts = (invoices ?? [])
    .filter((i) => (i.created_at as string) >= fromIso)
    .reduce((t, i) => t + Number(i.discount), 0);
  const tax = (invoices ?? [])
    .filter((i) => (i.created_at as string) >= fromIso && !["draft", "cancelled"].includes(i.status as string))
    .reduce((t, i) => t + Number(i.tax), 0);

  const jobsCheckedIn = (wos ?? []).filter((w) => (w.checked_in_at as string) >= fromIso).length;
  const completedInRange = (wos ?? []).filter(
    (w) => w.completed_at && (w.completed_at as string) >= fromIso,
  );
  const jobsCompleted = completedInRange.length;
  const jobsOpen = (wos ?? []).filter(
    (w) => !["checked_out", "cancelled"].includes(w.status as string),
  ).length;

  const repairHours = completedInRange
    .map((w) =>
      w.completed_at && w.checked_in_at
        ? (new Date(w.completed_at as string).getTime() - new Date(w.checked_in_at as string).getTime()) / 3600_000
        : null,
    )
    .filter((h): h is number => h != null && h >= 0);
  const avgRepairHours = repairHours.length ? repairHours.reduce((a, b) => a + b, 0) / repairHours.length : null;

  const now = Date.now();
  const overdue = (wos ?? []).filter(
    (w) =>
      !["checked_out", "cancelled"].includes(w.status as string) &&
      w.expected_completion &&
      new Date(w.expected_completion as string).getTime() < now,
  ).length;

  const nameById = new Map<string, string>();
  const memberIds = (members ?? []).map((m) => m.user_id as string);
  if (memberIds.length) {
    const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", memberIds);
    (profiles ?? []).forEach((p) => nameById.set(p.id as string, (p.full_name as string) || "—"));
  }

  const techAgg = new Map<string, { jobs: Set<string>; seconds: number; tasks: number }>();
  (timeEntries ?? []).forEach((e) => {
    const a = techAgg.get(e.technician_id as string) ?? { jobs: new Set(), seconds: 0, tasks: 0 };
    a.jobs.add(e.work_order_id as string);
    a.seconds += Number(e.duration_seconds ?? 0);
    techAgg.set(e.technician_id as string, a);
  });
  (tasks ?? []).forEach((t) => {
    if (t.status === "completed" && t.assigned_to) {
      const a = techAgg.get(t.assigned_to as string) ?? { jobs: new Set(), seconds: 0, tasks: 0 };
      a.tasks += 1;
      techAgg.set(t.assigned_to as string, a);
    }
  });
  const technicians = [...techAgg.entries()]
    .map(([id, a]) => ({ name: nameById.get(id) ?? "—", jobs: a.jobs.size, hours: a.seconds / 3600, tasks: a.tasks }))
    .sort((x, y) => y.hours - x.hours);

  // top customers by payments in range — join via invoices
  const { data: paidInvoices } = await supabase
    .from("invoices")
    .select("customer_id, paid_amount")
    .eq("garage_id", garageId)
    .gte("created_at", fromIso);
  const custSpend = new Map<string, number>();
  const custJobs = new Map<string, number>();
  (paidInvoices ?? []).forEach((i) => {
    if (i.customer_id) {
      custSpend.set(i.customer_id as string, (custSpend.get(i.customer_id as string) ?? 0) + Number(i.paid_amount));
      custJobs.set(i.customer_id as string, (custJobs.get(i.customer_id as string) ?? 0) + 1);
    }
  });
  const custName = new Map((customers ?? []).map((c) => [c.id as string, c.name as string]));
  const topCustomers = [...custSpend.entries()]
    .map(([id, spent]) => ({ name: custName.get(id) ?? "—", spent, jobs: custJobs.get(id) ?? 0 }))
    .sort((a, b) => b.spent - a.spent)
    .slice(0, 8);
  const newCustomers = (customers ?? []).filter((c) => (c.created_at as string) >= fromIso).length;

  const partName = new Map((parts ?? []).map((p) => [p.id as string, p.name as string]));
  const usageAgg = new Map<string, { qty: number; value: number }>();
  (usageTxns ?? []).forEach((t) => {
    const a = usageAgg.get(t.part_id as string) ?? { qty: 0, value: 0 };
    a.qty += Math.abs(Number(t.quantity_delta));
    a.value += Math.abs(Number(t.quantity_delta)) * Number(t.unit_cost ?? 0);
    usageAgg.set(t.part_id as string, a);
  });
  const partsUsed = [...usageAgg.entries()]
    .map(([id, a]) => ({ name: partName.get(id) ?? "—", qty: a.qty, value: a.value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  const stockValue = (parts ?? []).reduce((t, p) => t + Number(p.quantity) * Number(p.cost), 0);
  const lowStock = (parts ?? []).filter((p) => Number(p.quantity) <= Number(p.min_stock)).length;

  return {
    currency,
    range,
    revenue: rev,
    paymentsByDay,
    paymentsByMethod,
    partsRevenue,
    laborRevenue,
    servicesRevenue,
    partsCost,
    grossProfit,
    outstanding,
    discounts,
    tax,
    jobsCheckedIn,
    jobsCompleted,
    jobsOpen,
    avgRepairHours,
    overdue,
    technicians,
    topCustomers,
    newCustomers,
    partsUsed,
    stockValue,
    lowStock,
  };
}
