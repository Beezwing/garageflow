-- ============================================================================
-- GarageFlow — 0016 Fix invoice discount sign
--
-- Discount line items are stored with a NEGATIVE amount (addInvoiceItem does
-- `-abs(qty*unit_price)`). recalc_invoice summed those negatives into v_disc and
-- then did `v_sub - v_disc` — a double negative, so a discount *increased* the
-- total, and `invoices.discount` came out negative (every UI checks
-- `discount > 0` before showing the line, so it never showed).
--
-- Fix: make v_disc the positive discount magnitude, keep `v_sub - v_disc`.
-- ============================================================================

create or replace function public.recalc_invoice(p_invoice uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_sub numeric(12,2);
  v_disc numeric(12,2);
  v_paid numeric(12,2);
  v_tax numeric(12,2);
  v_total numeric(12,2);
  v_rate numeric(6,4);
  v_status invoice_status;
begin
  select coalesce(sum(case when kind = 'discount' then 0 else amount end), 0),
         coalesce(sum(case when kind = 'discount' then -amount else 0 end), 0)  -- negate → positive magnitude
    into v_sub, v_disc
    from public.invoice_items where invoice_id = p_invoice;

  select coalesce(sum(case when is_refund then -amount else amount end), 0)
    into v_paid from public.payments where invoice_id = p_invoice;

  select tax_rate, status into v_rate, v_status from public.invoices where id = p_invoice;
  v_tax := round((v_sub - v_disc) * coalesce(v_rate, 0), 2);
  v_total := (v_sub - v_disc) + v_tax;

  if v_status not in ('cancelled', 'refunded', 'draft') then
    if v_paid <= 0 then v_status := 'unpaid';
    elsif v_paid < v_total then v_status := 'partial';
    else v_status := 'paid';
    end if;
  end if;

  update public.invoices
    set subtotal = v_sub, discount = v_disc, tax = v_tax, total = v_total,
        paid_amount = v_paid, balance = v_total - v_paid, status = v_status
    where id = p_invoice;
end $$;
grant execute on function public.recalc_invoice(uuid) to authenticated;

-- re-run on every live invoice so existing discounts correct themselves
do $$
declare r record;
begin
  for r in select id from public.invoices where status not in ('cancelled', 'refunded') loop
    perform public.recalc_invoice(r.id);
  end loop;
end $$;
