-- ============================================================================
-- GarageFlow — Demo seed data
-- Run in the Supabase SQL editor AFTER 0001–0007. Idempotent: skips if the
-- demo garages already exist. Runs as the postgres role, so it writes tables
-- directly rather than calling the permission-checked RPCs.
--
-- Demo logins — password for EVERY demo user:  GarageFlow123!
--   Platform super admin ....... super@garageflow.test
--   Kingston Auto Care ......... admin@kingstonauto.test      (garage_admin)
--                               super.kac@kingstonauto.test  (supervisor)
--                               front.kac@kingstonauto.test  (receptionist)
--                               tech1.kac@kingstonauto.test  (technician)
--                               tech2.kac@kingstonauto.test  (technician)
--   Portmore Motor Works ....... admin@portmoremotors.test    (+ super/front/tech1/tech2@)
--   MoBay Speed Shop ........... admin@mobayspeed.test        (+ tech1@)
-- ============================================================================

do $$
declare
  v_pw text := 'GarageFlow123!';
  v_super uuid;
begin
  if exists (select 1 from public.garages where slug = 'kingston-auto-care') then
    raise notice 'GarageFlow demo data already present — skipping.';
    return;
  end if;

  create or replace function pg_temp.mkuser(p_email text, p_name text, p_pw text)
  returns uuid language plpgsql as $f$
  declare uid uuid := gen_random_uuid();
  begin
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                            email_confirmed_at, created_at, updated_at,
                            raw_app_meta_data, raw_user_meta_data)
    values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
            p_email, crypt(p_pw, gen_salt('bf')), now(), now(), now(),
            '{"provider":"email","providers":["email"]}'::jsonb,
            jsonb_build_object('full_name', p_name));
    insert into auth.identities (id, user_id, provider_id, identity_data, provider,
                                 last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), uid, uid::text,
            jsonb_build_object('sub', uid::text, 'email', p_email), 'email', now(), now(), now());
    update public.profiles set full_name = p_name where id = uid;
    return uid;
  end $f$;

  -- helper: consume ad-hoc part on a work order + move stock + line item
  create or replace function pg_temp.usepart(p_g uuid, p_wo uuid, p_part uuid, p_qty numeric, p_by uuid)
  returns void language plpgsql as $f$
  declare r public.parts%rowtype; newq numeric; txn uuid;
  begin
    select * into r from public.parts where id = p_part;
    newq := r.quantity - p_qty;
    update public.parts set quantity = newq where id = p_part;
    insert into public.inventory_transactions (garage_id, part_id, type, quantity_delta, quantity_after, unit_cost, work_order_id, user_id, note)
    values (p_g, p_part, 'use', -p_qty, newq, r.cost, p_wo, p_by, 'Demo seed usage')
    returning id into txn;
    insert into public.work_order_parts (garage_id, work_order_id, part_id, description, quantity, unit_price, unit_cost, added_by, txn_id)
    values (p_g, p_wo, p_part, r.name, p_qty, r.price, r.cost, p_by, txn);
  end $f$;

  -- helper: build invoice from a work order's lines
  create or replace function pg_temp.makeinvoice(p_wo uuid)
  returns uuid language plpgsql as $f$
  declare w public.work_orders%rowtype; inv uuid; seq bigint; num text; v_rate numeric;
  begin
    select * into w from public.work_orders where id = p_wo;
    select coalesce(tax_rate,0) into v_rate from public.garages where id = w.garage_id;
    seq := public.next_counter(w.garage_id, 'invoice:' || to_char(now(),'YYYY'));
    num := 'INV-' || to_char(now(),'YYYY') || '-' || lpad(seq::text, 6, '0');
    insert into public.invoices (garage_id, number, work_order_id, customer_id, status, tax_rate)
    values (w.garage_id, num, p_wo, w.customer_id, 'draft', v_rate) returning id into inv;
    insert into public.invoice_items (garage_id, invoice_id, kind, description, quantity, unit_price, amount, source_type, source_id)
      select wop.garage_id, inv, 'part', wop.description, wop.quantity, wop.unit_price, wop.amount, 'work_order_parts', wop.id
        from public.work_order_parts wop where wop.work_order_id = p_wo;
    insert into public.invoice_items (garage_id, invoice_id, kind, description, quantity, unit_price, amount, source_type, source_id)
      select wol.garage_id, inv, 'labor', wol.description, wol.hours, wol.rate, wol.amount, 'work_order_labor', wol.id
        from public.work_order_labor wol where wol.work_order_id = p_wo;
    insert into public.invoice_items (garage_id, invoice_id, kind, description, quantity, unit_price, amount, source_type, source_id)
      select wos.garage_id, inv, 'service', wos.description, wos.quantity, wos.unit_price, wos.amount, 'work_order_services', wos.id
        from public.work_order_services wos where wos.work_order_id = p_wo;
    perform public.recalc_invoice(inv);
    return inv;
  end $f$;

  v_super := pg_temp.mkuser('super@garageflow.test', 'Platform Admin', v_pw);
  update public.profiles set platform_role = 'super_admin' where id = v_super;

  -- ==========================================================================
  -- GARAGE 1 — Kingston Auto Care
  -- ==========================================================================
  declare
    g uuid; s_admin uuid; s_sup uuid; s_rec uuid; s_t1 uuid; s_t2 uuid;
    c1 uuid; c2 uuid; c3 uuid; c4 uuid;
    v1 uuid; v3 uuid; v4 uuid; v5 uuid;
    sup1 uuid; sup2 uuid;
    p_oil uuid; p_pad uuid; p_filter uuid; p_plug uuid; p_batt uuid;
    svc_diag uuid; svc_oil uuid; svc_ac uuid;
    wo1 uuid; wo2 uuid; wo4 uuid; insp1 uuid; inv1 uuid;
    y text := to_char(now(),'YYYY');
  begin
    insert into public.garages (name, slug, phone, email, address, tax_number, currency, status, plan_id, labor_rate, tax_rate)
    values ('Kingston Auto Care', 'kingston-auto-care', '876-555-0110', 'service@kingstonauto.test',
            '14 Half Way Tree Rd, Kingston 10', 'GCT-100234', 'JMD', 'active',
            (select id from public.subscription_plans where code='pro'), 3500, 0.15)
    returning id into g;
    insert into public.garage_settings (garage_id) values (g) on conflict do nothing;

    s_admin := pg_temp.mkuser('admin@kingstonauto.test',    'Marlon Beckford', v_pw);
    s_sup   := pg_temp.mkuser('super.kac@kingstonauto.test', 'Andrea Campbell', v_pw);
    s_rec   := pg_temp.mkuser('front.kac@kingstonauto.test', 'Kadene Reid',     v_pw);
    s_t1    := pg_temp.mkuser('tech1.kac@kingstonauto.test', 'Dwayne Brown',    v_pw);
    s_t2    := pg_temp.mkuser('tech2.kac@kingstonauto.test', 'Rohan Service',   v_pw);
    insert into public.memberships (garage_id, user_id, role) values
      (g, s_admin,'garage_admin'),(g, s_sup,'supervisor'),(g, s_rec,'receptionist'),
      (g, s_t1,'technician'),(g, s_t2,'technician');

    insert into public.customers (garage_id, name, phone, email, address, created_by) values
      (g,'Michelle Thompson','876-555-0201','michelle.t@example.com','8 Barbican Rd, Kingston 6', s_rec) returning id into c1;
    insert into public.customers (garage_id, name, phone, email, created_by) values
      (g,'Everton Gordon','876-555-0202','everton.g@example.com', s_rec) returning id into c2;
    insert into public.customers (garage_id, name, phone, created_by) values
      (g,'Sasha-Kay Miller','876-555-0203', s_rec) returning id into c3;
    insert into public.customers (garage_id, name, phone, email, created_by) values
      (g,'Devon Ricketts','876-555-0204','devon.r@example.com', s_rec) returning id into c4;

    insert into public.vehicles (garage_id, customer_id, make, model, year, license_plate, vin, engine_number, color, transmission, fuel_type, mileage) values
      (g,c1,'Toyota','Corolla',2016,'4823 FH','JT2BF22K1W0123456','ENG-2ZR-771','Silver','Automatic','Petrol',98450) returning id into v1;
    insert into public.vehicles (garage_id, customer_id, make, model, year, license_plate, vin, color, transmission, fuel_type, mileage) values
      (g,c1,'Honda','CR-V',2019,'5510 GK','JHLRW1H50KX004521','Blue','Automatic','Petrol',61200);
    insert into public.vehicles (garage_id, customer_id, make, model, year, license_plate, vin, color, transmission, fuel_type, mileage) values
      (g,c2,'Nissan','Note',2015,'6621 HB','SJNFAAE12U1102233','White','CVT','Petrol',120340) returning id into v3;
    insert into public.vehicles (garage_id, customer_id, make, model, year, license_plate, color, transmission, fuel_type, mileage) values
      (g,c3,'Suzuki','Swift',2018,'7712 KJ','Grey','Automatic','Petrol',54210) returning id into v4;
    insert into public.vehicles (garage_id, customer_id, make, model, year, license_plate, color, transmission, fuel_type, mileage) values
      (g,c4,'Mitsubishi','Lancer',2014,'3301 AA','Black','Automatic','Petrol',143870) returning id into v5;

    insert into public.suppliers (garage_id, name, contact_person, phone) values
      (g,'Island Auto Parts Ltd','Paul Chin','876-555-0301') returning id into sup1;
    insert into public.suppliers (garage_id, name, contact_person, phone) values
      (g,'Caribbean Lubricants','Nadine Wong','876-555-0302') returning id into sup2;

    insert into public.parts (garage_id, name, part_number, category, supplier_id, cost, price, quantity, min_stock, location) values
      (g,'Engine Oil 5W-30 (1L)','OIL-5W30-1L','Fluids',sup2,900,1500,48,12,'A1') returning id into p_oil;
    insert into public.parts (garage_id, name, part_number, category, supplier_id, cost, price, quantity, min_stock, location) values
      (g,'Front Brake Pad Set','BRK-PAD-FR','Brakes',sup1,4200,7800,6,4,'B3') returning id into p_pad;
    insert into public.parts (garage_id, name, part_number, category, supplier_id, cost, price, quantity, min_stock, location) values
      (g,'Oil Filter','FLT-OIL-STD','Filters',sup1,550,1200,30,10,'A2') returning id into p_filter;
    insert into public.parts (garage_id, name, part_number, category, supplier_id, cost, price, quantity, min_stock, location) values
      (g,'Spark Plug','PLG-IRID','Ignition',sup1,700,1400,3,8,'C1') returning id into p_plug;
    insert into public.parts (garage_id, name, part_number, category, supplier_id, cost, price, quantity, min_stock, location) values
      (g,'Battery 12V 60Ah','BAT-60AH','Electrical',sup1,12500,19000,4,2,'D1') returning id into p_batt;

    insert into public.services (garage_id, name, description, category, default_price, est_labor_minutes) values
      (g,'Oil Change','Engine oil + filter replacement','Maintenance',8000,45) returning id into svc_oil;
    insert into public.services (garage_id, name, description, category, default_price, est_labor_minutes) values
      (g,'Front Brake Service','Replace front pads, inspect rotors','Brakes',15000,90);
    insert into public.services (garage_id, name, description, category, default_price, est_labor_minutes) values
      (g,'Diagnostic Scan','Full OBD-II diagnostic scan','Diagnostics',5000,30) returning id into svc_diag;
    insert into public.services (garage_id, name, description, category, default_price, est_labor_minutes) values
      (g,'A/C Service','A/C regas and leak check','Climate',10000,60) returning id into svc_ac;

    insert into public.checklist_templates (garage_id, kind, name, is_default, items) values
      (g,'inspection','Standard Intake Inspection',true,
       '["Front bumper","Rear bumper","Hood","Roof","Windshield","Headlights","Tail lights","Tyres","Wheels","Seats","Dashboard","Radio","A/C controls","Engine oil level","Coolant level","Battery","Visible leaks"]'::jsonb),
      (g,'quality','Standard Quality Control',true,
       '["Requested repairs completed","Repair checklist completed","Additional approved work completed","Vehicle road tested","Warning lights checked","No tools left in vehicle","Vehicle condition acceptable","Ready for customer"]'::jsonb),
      (g,'checkout','Vehicle Release',true,
       '["Repairs completed","Technician checklist completed","Quality inspection completed","Invoice settled","Customer belongings checked","Keys ready","Customer identified"]'::jsonb);

    -- WO1: completed + paid + checked out
    insert into public.work_orders (garage_id, number, customer_id, vehicle_id, status, priority, complaint, requested_work, mileage_in, fuel_level_in, checked_in_by, checked_in_at, completed_at)
    values (g,'JOB-'||y||'-000001',c1,v1,'checked_out','normal','Due for service, brake squeal','Full service + check brakes',98450,55,s_rec, now()-interval '9 days', now()-interval '7 days')
    returning id into wo1;
    insert into public.inspections (garage_id, work_order_id, kind, performed_by, checklist, notes)
    values (g,wo1,'checkin',s_sup,'[{"section":"Exterior","item":"Windshield","status":"ok"},{"section":"Brakes","item":"Front pads","status":"attention","notes":"Worn near limit"}]'::jsonb,'Minor stone chip on windshield noted at intake.')
    returning id into insp1;
    insert into public.inspection_damages (garage_id, inspection_id, view, x, y, damage_type, description)
    values (g,insp1,'front',0.62,0.30,'crack','Small stone chip, driver side windshield');
    insert into public.technician_assignments (garage_id, work_order_id, technician_id, scope, assigned_by) values (g,wo1,s_t1,'Service + brakes',s_sup);
    insert into public.work_order_tasks (garage_id, work_order_id, title, status, assigned_to, sequence) values
      (g,wo1,'Drain oil and replace filter','completed',s_t1,1),
      (g,wo1,'Replace front brake pads','completed',s_t1,2),
      (g,wo1,'Road test','completed',s_t1,3);
    insert into public.time_entries (garage_id, work_order_id, technician_id, started_at, ended_at) values
      (g,wo1,s_t1, now()-interval '8 days 4 hours', now()-interval '8 days 1 hour');
    perform pg_temp.usepart(g,wo1,p_oil,4,s_t1);
    perform pg_temp.usepart(g,wo1,p_filter,1,s_t1);
    perform pg_temp.usepart(g,wo1,p_pad,1,s_t1);
    insert into public.work_order_labor (garage_id, work_order_id, description, hours, rate, technician_id, created_by)
    values (g,wo1,'Service labour + brake replacement',2.5,3500,s_t1,s_sup);
    insert into public.work_order_services (garage_id, work_order_id, service_id, description, quantity, unit_price, created_by)
    values (g,wo1,svc_diag,'Diagnostic Scan',1,5000,s_sup);
    inv1 := pg_temp.makeinvoice(wo1);
    update public.invoices set status='unpaid', issued_at=now()-interval '7 days' where id=inv1;
    perform public.recalc_invoice(inv1);
    insert into public.payments (garage_id, invoice_id, amount, method, received_by, reference)
      select g, inv1, total, 'card', s_rec, 'TERM-4471' from public.invoices where id=inv1;
    insert into public.quality_inspections (garage_id, work_order_id, passed, supervisor_id, notes, checklist)
    values (g,wo1,true,s_sup,'All good, road tested 6km.','[{"item":"Vehicle road tested","checked":true},{"item":"No tools left in vehicle","checked":true}]'::jsonb);
    insert into public.checkouts (garage_id, work_order_id, collected_by_name, relationship, id_verified, released_by, final_mileage)
    values (g,wo1,'Michelle Thompson','Owner',true,s_rec,98461);

    -- WO2: in progress, 2 technicians, pending additional work
    insert into public.work_orders (garage_id, number, customer_id, vehicle_id, status, priority, complaint, requested_work, mileage_in, fuel_level_in, checked_in_by, checked_in_at)
    values (g,'JOB-'||y||'-000002',c2,v3,'in_progress','urgent','A/C not cold, engine light on','Diagnose engine light, fix A/C',120340,30,s_rec, now()-interval '1 day')
    returning id into wo2;
    insert into public.inspections (garage_id, work_order_id, kind, performed_by, checklist)
    values (g,wo2,'checkin',s_sup,'[{"section":"Engine","item":"Battery","status":"ok"}]'::jsonb);
    insert into public.technician_assignments (garage_id, work_order_id, technician_id, scope, assigned_by) values
      (g,wo2,s_t1,'Engine diagnostics',s_sup),(g,wo2,s_t2,'A/C system',s_sup);
    insert into public.work_order_tasks (garage_id, work_order_id, title, status, assigned_to, sequence) values
      (g,wo2,'OBD-II scan and diagnose','in_progress',s_t1,1),
      (g,wo2,'A/C pressure test + regas','not_started',s_t2,2);
    insert into public.time_entries (garage_id, work_order_id, technician_id, started_at) values (g,wo2,s_t1, now()-interval '2 hours');
    insert into public.additional_work_requests (garage_id, work_order_id, problem, recommendation, parts_estimate, labor_estimate, price, requested_by, status)
    values (g,wo2,'Spark plugs heavily worn, misfire code P0301','Replace all 4 spark plugs',5600,3500,9100,s_t1,'pending');

    -- WO3: awaiting inspection
    insert into public.work_orders (garage_id, number, customer_id, vehicle_id, status, priority, complaint, requested_work, mileage_in, fuel_level_in, checked_in_by, checked_in_at)
    values (g,'JOB-'||y||'-000003',c3,v4,'awaiting_inspection','normal','Vibration at highway speed','Check wheels / balancing',54210,70,s_rec, now()-interval '3 hours');

    -- WO4: ready for payment
    insert into public.work_orders (garage_id, number, customer_id, vehicle_id, status, priority, complaint, requested_work, mileage_in, fuel_level_in, checked_in_by, checked_in_at, completed_at)
    values (g,'JOB-'||y||'-000004',c4,v5,'ready_for_payment','normal','Battery keeps dying','Replace battery, test charging system',143870,20,s_rec, now()-interval '2 days', now()-interval '4 hours')
    returning id into wo4;
    insert into public.technician_assignments (garage_id, work_order_id, technician_id, scope, assigned_by) values (g,wo4,s_t2,'Electrical',s_sup);
    perform pg_temp.usepart(g,wo4,p_batt,1,s_t2);
    insert into public.work_order_labor (garage_id, work_order_id, description, hours, rate, technician_id, created_by)
    values (g,wo4,'Battery replacement + charging system test',1,3500,s_t2,s_sup);
    perform pg_temp.makeinvoice(wo4);
    update public.invoices set status='unpaid', issued_at=now() where work_order_id=wo4;
    perform public.recalc_invoice((select id from public.invoices where work_order_id=wo4));

    -- counters so future check-ins/invoices continue cleanly
    perform public.next_counter(g,'work_order:'||y);
    perform public.next_counter(g,'work_order:'||y);
    perform public.next_counter(g,'work_order:'||y);
    perform public.next_counter(g,'work_order:'||y);

    insert into public.appointments (garage_id, customer_id, vehicle_id, service_id, title, scheduled_at, staff_id, status) values
      (g,c1,(select id from public.vehicles where garage_id=g and model='CR-V'),svc_oil,'Oil change - CR-V', date_trunc('day',now())+interval '1 day 9 hours', s_rec,'confirmed'),
      (g,c2,v3,svc_ac,'A/C follow-up', date_trunc('day',now())+interval '2 days 11 hours', s_rec,'scheduled');

    insert into public.notifications (garage_id, roles, title, body, entity_type, entity_id) values
      (g, array['garage_admin','supervisor']::membership_role[], 'Additional work needs approval',
       'JOB-'||y||'-000002: spark plug replacement (JMD 9,100) pending customer approval','work_order',wo2::text),
      (g, array['garage_admin','supervisor']::membership_role[], 'Low stock: Spark Plug',
       'Spark Plug is below minimum stock (3 of 8).','part',p_plug::text);
  end;

  -- ==========================================================================
  -- GARAGE 2 — Portmore Motor Works
  -- ==========================================================================
  declare
    g uuid; a uuid; sv uuid; r uuid; t1 uuid; t2 uuid;
    c1 uuid; c2 uuid; v1 uuid; v2 uuid; su uuid;
    y text := to_char(now(),'YYYY');
  begin
    insert into public.garages (name, slug, phone, email, address, currency, status, plan_id, labor_rate)
    values ('Portmore Motor Works','portmore-motor-works','876-555-0400','info@portmoremotors.test',
            '2 Port Henderson Rd, Portmore','JMD','active',
            (select id from public.subscription_plans where code='basic'),3000)
    returning id into g;
    insert into public.garage_settings (garage_id) values (g) on conflict do nothing;

    a  := pg_temp.mkuser('admin@portmoremotors.test','Garfield Powell', v_pw);
    sv := pg_temp.mkuser('super@portmoremotors.test','Tanya Foster',    v_pw);
    r  := pg_temp.mkuser('front@portmoremotors.test','Kemar Lawson',    v_pw);
    t1 := pg_temp.mkuser('tech1@portmoremotors.test','Junior Walters',  v_pw);
    t2 := pg_temp.mkuser('tech2@portmoremotors.test','Omar Bailey',     v_pw);
    insert into public.memberships (garage_id, user_id, role) values
      (g,a,'garage_admin'),(g,sv,'supervisor'),(g,r,'receptionist'),(g,t1,'technician'),(g,t2,'technician');

    insert into public.customers (garage_id, name, phone, created_by) values (g,'Racquel Simpson','876-555-0410', r) returning id into c1;
    insert into public.customers (garage_id, name, phone, created_by) values (g,'Nkechi Palmer','876-555-0411', r) returning id into c2;
    insert into public.vehicles (garage_id, customer_id, make, model, year, license_plate, color, transmission, fuel_type, mileage) values
      (g,c1,'Mazda','Axela',2017,'9021 PM','Red','Automatic','Petrol',72300) returning id into v1;
    insert into public.vehicles (garage_id, customer_id, make, model, year, license_plate, color, transmission, fuel_type, mileage) values
      (g,c2,'Subaru','Impreza',2016,'9124 PN','Blue','CVT','Petrol',88100) returning id into v2;
    insert into public.suppliers (garage_id, name, phone) values (g,'Portmore Parts Depot','876-555-0420') returning id into su;
    insert into public.parts (garage_id, name, part_number, category, supplier_id, cost, price, quantity, min_stock) values
      (g,'Engine Oil 5W-30 (1L)','OIL-1L','Fluids',su,950,1600,20,8);
    insert into public.services (garage_id, name, category, default_price, est_labor_minutes) values (g,'Oil Change','Maintenance',8500,45);

    insert into public.work_orders (garage_id, number, customer_id, vehicle_id, status, complaint, requested_work, mileage_in, fuel_level_in, checked_in_by, checked_in_at)
    values (g,'JOB-'||y||'-000001',c1,v1,'assigned','Service due','Oil change + inspection',72300,50,r, now()-interval '5 hours');
    insert into public.work_orders (garage_id, number, customer_id, vehicle_id, status, complaint, requested_work, mileage_in, fuel_level_in, checked_in_by, checked_in_at)
    values (g,'JOB-'||y||'-000002',c2,v2,'awaiting_parts','Clutch slipping','Replace clutch kit',88100,25,r, now()-interval '1 day');
    perform public.next_counter(g,'work_order:'||y);
    perform public.next_counter(g,'work_order:'||y);
  end;

  -- ==========================================================================
  -- GARAGE 3 — MoBay Speed Shop (trial)
  -- ==========================================================================
  declare
    g uuid; a uuid; t1 uuid; c1 uuid; v1 uuid;
    y text := to_char(now(),'YYYY');
  begin
    insert into public.garages (name, slug, phone, email, address, currency, status, plan_id, labor_rate)
    values ('MoBay Speed Shop','mobay-speed-shop','876-555-0500','hello@mobayspeed.test',
            '18 Queens Dr, Montego Bay','JMD','trial',
            (select id from public.subscription_plans where code='free'),3200)
    returning id into g;
    insert into public.garage_settings (garage_id) values (g) on conflict do nothing;

    a  := pg_temp.mkuser('admin@mobayspeed.test','Shanice Grant', v_pw);
    t1 := pg_temp.mkuser('tech1@mobayspeed.test','Andre Clarke',  v_pw);
    insert into public.memberships (garage_id, user_id, role) values (g,a,'garage_admin'),(g,t1,'technician');
    insert into public.customers (garage_id, name, phone, created_by) values (g,'Kirk Henderson','876-555-0510', a) returning id into c1;
    insert into public.vehicles (garage_id, customer_id, make, model, year, license_plate, color, transmission, fuel_type, mileage) values
      (g,c1,'Toyota','Mark X',2013,'1200 MB','White','Automatic','Petrol',156700) returning id into v1;
    insert into public.work_orders (garage_id, number, customer_id, vehicle_id, status, complaint, requested_work, mileage_in, fuel_level_in, checked_in_by, checked_in_at)
    values (g,'JOB-'||y||'-000001',c1,v1,'checked_in','Overheating','Cooling system diagnosis',156700,40,a, now()-interval '30 minutes');
    perform public.next_counter(g,'work_order:'||y);
  end;

  raise notice 'GarageFlow demo data seeded. All demo users password: %', v_pw;
end $$;
