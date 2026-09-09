-- ============================================================================
-- GarageFlow — 0017 Stop sync_wo_invoice creating a second invoice
--
-- sync_wo_invoice looked only for a draft/unpaid/partial invoice on the work
-- order. If the job already had a *paid* invoice (from the seed, or a real
-- earlier payment), it saw none and created a brand-new draft — duplicating
-- every line. Any part/labour/service change on a job with a settled invoice
-- silently spawned a phantom invoice.
--
-- Fix: reuse the most recent non-cancelled invoice for the job. If it's already
-- paid/refunded, leave it untouched (new charges after settlement need a
-- deliberate supplementary invoice, not an automatic rebuild).
-- ============================================================================

create or replace function public.sync_wo_invoice(p_wo uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_wo public.work_orders%rowtype;
  v_inv uuid;
  v_status invoice_status;
  v_seq bigint;
  v_number text;
  v_rate numeric(6,4);
begin
  select * into v_wo from public.work_orders where id = p_wo;
  if v_wo.id is null then return null; end if;

  -- the most recent non-cancelled invoice for this job (open or not)
  select id, status into v_inv, v_status from public.invoices
    where work_order_id = p_wo and status <> 'cancelled'
    order by created_at desc limit 1;

  -- already settled → don't reopen or rebuild it
  if v_inv is not null and v_status in ('paid', 'refunded') then
    return v_inv;
  end if;

  if v_inv is null then
    if v_wo.status = 'cancelled' then return null; end if;
    select coalesce(tax_rate, 0) into v_rate from public.garages where id = v_wo.garage_id;
    v_seq := public.next_counter(v_wo.garage_id, 'invoice:' || to_char(now(), 'YYYY'));
    v_number := 'INV-' || to_char(now(), 'YYYY') || '-' || lpad(v_seq::text, 6, '0');
    insert into public.invoices (garage_id, number, work_order_id, customer_id, status, tax_rate)
    values (v_wo.garage_id, v_number, p_wo, v_wo.customer_id, 'draft', v_rate)
    returning id into v_inv;
  end if;

  delete from public.invoice_items
    where invoice_id = v_inv
      and source_type in ('work_order_parts', 'work_order_labor', 'work_order_services');

  insert into public.invoice_items (garage_id, invoice_id, kind, description, quantity, unit_price, amount, source_type, source_id)
    select garage_id, v_inv, 'part', description, quantity, unit_price, amount, 'work_order_parts', id
      from public.work_order_parts where work_order_id = p_wo;
  insert into public.invoice_items (garage_id, invoice_id, kind, description, quantity, unit_price, amount, source_type, source_id)
    select garage_id, v_inv, 'labor', description, hours, rate, amount, 'work_order_labor', id
      from public.work_order_labor where work_order_id = p_wo;
  insert into public.invoice_items (garage_id, invoice_id, kind, description, quantity, unit_price, amount, source_type, source_id)
    select garage_id, v_inv, 'service', description, quantity, unit_price, amount, 'work_order_services', id
      from public.work_order_services where work_order_id = p_wo;

  perform public.recalc_invoice(v_inv);
  return v_inv;
end $$;

-- clean up phantom drafts: a draft invoice on a job that also has a paid
-- invoice, with no payments of its own → cancel it.
update public.invoices d
  set status = 'cancelled'
  where d.status = 'draft'
    and not exists (select 1 from public.payments p where p.invoice_id = d.id)
    and exists (
      select 1 from public.invoices s
      where s.work_order_id = d.work_order_id and s.id <> d.id and s.status = 'paid'
    );
