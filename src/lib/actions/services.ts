"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireGarageContext } from "@/lib/auth";
import { assertCan } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";
import type { ActionState } from "@/lib/actions/types";

export async function saveService(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireGarageContext();
  try {
    assertCan(ctx.role, "service.manage");
  } catch (e) {
    return { error: (e as Error).message };
  }
  const id = String(formData.get("id") ?? "");
  const data = {
    name: String(formData.get("name") ?? "").trim(),
    category: String(formData.get("category") ?? "").trim() || null,
    description: String(formData.get("description") ?? "").trim() || null,
    default_price: Math.max(0, Number(formData.get("default_price")) || 0),
    est_labor_minutes: Math.max(0, Math.round(Number(formData.get("est_labor_minutes")) || 0)),
    active: formData.get("active") !== "false",
  };
  if (data.name.length < 2) return { error: "Service name is required." };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("services").update(data).eq("id", id).eq("garage_id", ctx.garage.id)
    : await supabase.from("services").insert({ ...data, garage_id: ctx.garage.id });
  if (error) return { error: error.message };

  await writeAuditLog({
    garageId: ctx.garage.id,
    action: id ? "service.updated" : "service.created",
    entityType: "service",
    entityId: id || data.name,
    after: data,
  });
  revalidatePath("/settings/services");
  return { ok: true };
}

export async function toggleService(id: string, active: boolean): Promise<void> {
  const ctx = await requireGarageContext();
  assertCan(ctx.role, "service.manage");
  const supabase = await createClient();
  await supabase.from("services").update({ active }).eq("id", id).eq("garage_id", ctx.garage.id);
  revalidatePath("/settings/services");
}

export async function deleteService(id: string): Promise<void> {
  const ctx = await requireGarageContext();
  assertCan(ctx.role, "service.manage");
  const supabase = await createClient();
  await supabase.from("services").delete().eq("id", id).eq("garage_id", ctx.garage.id);
  revalidatePath("/settings/services");
}

/* ------------------------------ CSV import ------------------------------ */

/** Minimal RFC-4180-ish parser: handles quoted fields, "" escapes, CRLF/LF. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += c;
    }
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

const truthy = (v: string) => /^(y|yes|true|1|active)$/i.test(v.trim());

export interface ImportResult {
  ok?: boolean;
  error?: string;
  created?: number;
  updated?: number;
  skipped?: number;
  problems?: string[];
}

export async function importServices(csvText: string): Promise<ImportResult> {
  const ctx = await requireGarageContext();
  try {
    assertCan(ctx.role, "service.manage");
  } catch (e) {
    return { error: (e as Error).message };
  }

  const rows = parseCsv(csvText);
  if (rows.length < 2) return { error: "That file has no rows under the header." };

  const header = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const col = (name: string) => header.indexOf(name);
  const iName = col("name");
  if (iName === -1) return { error: 'The file needs a "name" column. Download the template for the exact format.' };
  const iCat = col("category");
  const iPrice = col("default_price") !== -1 ? col("default_price") : col("price");
  const iMin = col("est_labor_minutes") !== -1 ? col("est_labor_minutes") : col("minutes");
  const iDesc = col("description");
  const iActive = col("active");

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("services")
    .select("id, name")
    .eq("garage_id", ctx.garage.id);
  const byName = new Map((existing ?? []).map((s) => [(s.name as string).trim().toLowerCase(), s.id as string]));

  const problems: string[] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const name = (cells[iName] ?? "").trim();
    if (name.length < 2) {
      problems.push(`Row ${r + 1}: missing name — skipped`);
      skipped++;
      continue;
    }
    const priceRaw = iPrice !== -1 ? (cells[iPrice] ?? "").replace(/[^0-9.-]/g, "") : "";
    const price = Math.max(0, Number(priceRaw) || 0);
    const minutes = iMin !== -1 ? Math.max(0, Math.round(Number((cells[iMin] ?? "").replace(/[^0-9.-]/g, "")) || 0)) : 0;
    const record = {
      name,
      category: iCat !== -1 ? (cells[iCat] ?? "").trim() || null : null,
      default_price: price,
      est_labor_minutes: minutes,
      description: iDesc !== -1 ? (cells[iDesc] ?? "").trim() || null : null,
      active: iActive !== -1 ? truthy(cells[iActive] ?? "yes") : true,
    };

    const hit = byName.get(name.toLowerCase());
    const res = hit
      ? await supabase.from("services").update(record).eq("id", hit).eq("garage_id", ctx.garage.id)
      : await supabase.from("services").insert({ ...record, garage_id: ctx.garage.id });
    if (res.error) {
      problems.push(`Row ${r + 1} (${name}): ${res.error.message}`);
      skipped++;
    } else if (hit) {
      updated++;
    } else {
      created++;
      byName.set(name.toLowerCase(), "new"); // dedupe repeats within the same file
    }
  }

  await writeAuditLog({
    garageId: ctx.garage.id,
    action: "service.imported",
    entityType: "service",
    entityId: ctx.garage.id,
    after: { created, updated, skipped },
  });

  revalidatePath("/settings/services");
  return { ok: true, created, updated, skipped, problems };
}
