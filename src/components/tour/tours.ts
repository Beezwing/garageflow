import type { MembershipRole } from "@/types/domain";

export type Step = {
  element?: string;
  title: string;
  description: string;
  /** check-in wizard step to jump to as this step highlights */
  wizardStep?: number;
};

export interface TourDef {
  key: string;
  label: string;
  /** does this tour belong to the current page? */
  match: (path: string, role: MembershipRole) => boolean;
  steps: (role: MembershipRole) => Step[];
  /** keep all steps + drive an external wizard (check-in) */
  wizardDriven?: boolean;
  /** only auto-run for these roles (still replayable by anyone on the page) */
  autoRoles?: MembershipRole[];
}

const nav = (href: string) => `[data-tour="${href}"]`;

/* ------------------------------------------------------------------ */
/* App overview — highlights the sidebar. Fires once per user.         */
/* ------------------------------------------------------------------ */

function appOverview(role: MembershipRole): Step[] {
  const intro: Step = {
    title: "Welcome to GarageFlow 👋",
    description:
      "A 30-second tour of where things live. Every page has its own quick tour too — and a “don’t show again” box on each.",
  };
  if (role === "technician") {
    return [
      intro,
      { element: nav("/workshop/my-jobs"), title: "My jobs", description: "Your assigned vehicles, your tasks, and a clock for each job. Start here every day." },
      { element: nav("/workshop/jobs"), title: "All jobs", description: "The whole workshop if you need the bigger picture." },
      { element: nav("/safety"), title: "Safety", description: "Shop safety reminders. You’ll also get a popup of these when you open a job." },
      { element: nav("/notifications"), title: "Notifications", description: "You’re pinged here when you’re assigned or extra work is approved." },
      { element: '[data-tour="user-menu"]', title: "Your account", description: "Switch garages, sign out, or replay any tour." },
    ];
  }
  return [
    intro,
    { element: nav("/dashboard"), title: "Dashboard", description: "Your morning glance — what’s in, what’s waiting, revenue, who’s working, jobs ready for payment." },
    { element: nav("/workshop/check-in"), title: "Check-in", description: "Start here when a car arrives. It opens the job and the invoice together." },
    { element: nav("/workshop/jobs"), title: "Jobs", description: "Every work order. Open one to assign techs, add charges, handle approvals and QC." },
    { element: nav("/workshop/appointments"), title: "Appointments", description: "Online requests from customers land here — confirm or propose a new time." },
    { element: nav("/customers"), title: "Customers & vehicles", description: "Full history for every customer and vehicle. Search by name, plate, VIN or engine number." },
    { element: nav("/inventory/parts"), title: "Inventory", description: "Parts and suppliers. Using a part on a job deducts stock automatically." },
    { element: nav("/billing/invoices"), title: "Billing", description: "Invoices build live from each job. Record cash, card or transfer." },
    { element: nav("/reports"), title: "Reports", description: "Revenue, profit, technician productivity, inventory — export to PDF or CSV." },
    { element: nav("/safety"), title: "Safety", description: "Standard safety reminders plus any you add for your shop." },
    { element: '[data-tour="user-menu"]', title: "That’s the map", description: "Replay this or any page’s tour from here whenever you need it." },
  ];
}

/* ------------------------------------------------------------------ */
/* Per-page tours                                                      */
/* ------------------------------------------------------------------ */

const dashboardTour: Step[] = [
  { title: "The dashboard", description: "Everything you need at a glance — it refreshes as jobs move through the shop." },
  { element: '[data-tour="/workshop/check-in"]', title: "Check a car in", description: "The big blue button (and this menu item) start a new job." },
  { title: "Ready to invoice / take payment", description: "Further down, jobs whose repairs are done show here with a Take payment or Check-out link — your cashier’s to-do list." },
  { title: "Recent activity", description: "The latest jobs and their status. Click any row to open the work order." },
];

const myJobsTour: Step[] = [
  { element: '[data-tour="my-jobs"]', title: "Your jobs", description: "Only the vehicles assigned to you. Active jobs on top, recently closed below." },
  { title: "Clock on a job", description: "Use Start / Stop work to track your time — it lands on the invoice as labour and on your productivity report." },
  { title: "Mark work done", description: "When your part is finished, hit “Mark work done”. When every assigned tech is done, the job moves to repair-complete and the invoice is raised." },
  { element: '[data-tour="/safety"]', title: "Safety first", description: "Opening a job shows a safety popup. Read it every time — it only takes a few seconds." },
];

const jobDetailTour: Step[] = [
  { element: '[data-tour="workorder-page"]', title: "The work order", description: "One screen for the whole job — status, the vehicle, the invoice, and every panel below." },
  { element: '[data-tour="assign-panel"]', title: "Assign technicians", description: "Add one or more techs with a scope note. They’ll see it under My jobs and get a notification." },
  { element: '[data-tour="tasks-panel"]', title: "Tasks", description: "Break the job into checkable steps, or load a template for common services." },
  { element: '[data-tour="work-log"]', title: "Work log & notes", description: "Technicians record what they did and any diagnosis here. It’s append-only — a clean history." },
  { element: '[data-tour="charges-panel"]', title: "Parts, labour & charges", description: "Add parts (stock is deducted), labour lines, or catalogue services. Everything flows onto the invoice live." },
  { element: '[data-tour="additional-work-panel"]', title: "Extra work found", description: "Raise a request for the customer to approve. The job pauses until they respond — in person or from their portal." },
  { element: '[data-tour="quality-panel"]', title: "Quality check", description: "A supervisor signs off against your checklist before the car goes back." },
  { element: '[data-tour="invoice-panel"]', title: "The invoice", description: "Created at check-in and kept in sync. Once repairs are done it’s issued for payment." },
];

const jobsListTour: Step[] = [
  { title: "Active jobs", description: "Every open work order in the shop." },
  { title: "Filter & search", description: "Narrow by status or priority, or search a job number, plate or customer." },
  { title: "Open a job", description: "Click any row for the full work order — assignment, charges, approvals, invoice." },
];

const customersTour: Step[] = [
  { element: '[data-tour="customers-page"]', title: "Customers", description: "Everyone whose vehicle you’ve serviced, with their vehicle count and open jobs." },
  { element: '[data-tour="new-customer"]', title: "Add a customer", description: "Name and a phone number is enough. You can add their vehicle now or at check-in." },
  { title: "Open a profile", description: "Click a row for contact details, every vehicle they own, and full job history." },
];

const vehiclesTour: Step[] = [
  { element: '[data-tour="vehicles-page"]', title: "Vehicles", description: "Every vehicle on file. Search by plate, VIN, make or engine number." },
  { element: '[data-tour="new-vehicle"]', title: "Add a vehicle", description: "Link it to a customer. Plate and VIN are checked so you don’t get duplicates." },
  { title: "Vehicle history", description: "Open one for its full service history, photos and recorded damage." },
];

const partsTour: Step[] = [
  { element: '[data-tour="parts-page"]', title: "Parts inventory", description: "Stock levels, cost and sale price. Low-stock items are flagged." },
  { element: '[data-tour="new-part"]', title: "Add a part", description: "Set a reorder level and it’ll warn you before you run out." },
  { title: "Stock moves itself", description: "Using a part on a job deducts it here; “Receive stock” adds it back. Every movement is logged." },
];

const invoicesListTour: Step[] = [
  { title: "Invoices", description: "One per job, built live from its parts, labour and services." },
  { title: "Status at a glance", description: "Draft while the job runs, then unpaid, part-paid or paid. Filter by status to find what’s owed." },
  { title: "Open one to take payment", description: "Record cash, card or transfer. Partial payments are fine — it flips to Paid at zero balance." },
];

const appointmentsTour: Step[] = [
  { title: "Appointments", description: "Booked work, and requests customers send from your online booking link." },
  { title: "Appointment requests", description: "New requests appear at the top. Confirm the time, or propose another — the customer accepts from their account." },
  { element: '[data-tour="new-appointment"]', title: "Book one yourself", description: "Phone bookings go here. Turn any appointment into a check-in when the car arrives." },
];

const reportsTour: Step[] = [
  { title: "Reports", description: "Financial, profitability, operations, technicians, customers and inventory — pick a date range up top." },
  { title: "Export", description: "Every section exports to PDF or CSV for your accountant or your own records." },
];

const safetyTour: Step[] = [
  { title: "Safety", description: "The reminders technicians see when they open a job, and can re-read here any time." },
  { title: "Standard + your own", description: "A standard library ships with GarageFlow. Admins and supervisors add shop-specific ones under Settings › Safety." },
];

const settingsTour: Step[] = [
  { title: "Settings", description: "Your business details, tax and labour rates, and the online booking link all live here." },
  { title: "The tabs", description: "Services & pricing (with CSV import), inspection checklists, safety tips, staff and your subscription." },
];

const checkinTour: Step[] = [
  { element: '[data-tour="checkin-steps"]', title: "Checking a vehicle in", description: "Seven steps, shown here. This tour walks each one — use Next / Back." },
  { element: '[data-tour="checkin-body"]', wizardStep: 0, title: "Step 1 · Customer", description: "Find an existing customer or add a new one. One person can own several vehicles." },
  { element: '[data-tour="checkin-body"]', wizardStep: 1, title: "Step 2 · Vehicle", description: "Pick one of their vehicles or add one. Plate and VIN are checked for duplicates." },
  { element: '[data-tour="checkin-body"]', wizardStep: 2, title: "Step 3 · Job details + estimate", description: "Complaint, priority, mileage, fuel — then the planned work. What you list here opens the invoice." },
  { element: '[data-tour="checkin-body"]', wizardStep: 3, title: "Step 4 · Condition", description: "Run the inspection checklist and tap the car diagram to mark existing damage." },
  { element: '[data-tour="checkin-body"]', wizardStep: 4, title: "Step 5 · Photos", description: "Before-photos by category. This protects the garage and the customer." },
  { element: '[data-tour="checkin-body"]', wizardStep: 5, title: "Step 6 · Sign-off", description: "Optional customer and staff signatures on the recorded condition." },
  { element: '[data-tour="checkin-body"]', wizardStep: 6, title: "Step 7 · Review & check in", description: "Confirm the summary, then Check in. You land on the job card, ready to assign." },
];

const paymentTour: Step[] = [
  { title: "Taking a payment", description: "This invoice built itself from the job’s parts, labour and services." },
  { element: '[data-tour="invoice-items"]', title: "Line items", description: "Lines marked “from job” are read-only — edit the work order to change them. Add one-off charges or a discount below." },
  { element: '[data-tour="invoice-summary"]', title: "Totals", description: "Subtotal, tax and the balance due update as lines and payments change." },
  { element: '[data-tour="invoice-payment"]', title: "Record a payment", description: "Amount, method and a reference. Partial payments are fine — it flips to Paid at zero balance." },
  { element: '[data-tour="invoice-actions"]', title: "Then release", description: "Once it’s paid, checkout on the work order unblocks. Print / PDF gives the customer a copy." },
];

/* ------------------------------------------------------------------ */

export const APP_OVERVIEW: TourDef = {
  key: "app",
  label: "App overview",
  match: (p, role) => (role === "technician" ? p === "/workshop/my-jobs" : p === "/dashboard"),
  steps: appOverview,
};

export const ROUTE_TOURS: TourDef[] = [
  { key: "dashboard", label: "Dashboard", match: (p) => p === "/dashboard", steps: () => dashboardTour, autoRoles: ["garage_admin", "supervisor"] },
  { key: "my-jobs", label: "My jobs", match: (p) => p === "/workshop/my-jobs", steps: () => myJobsTour },
  { key: "job-detail", label: "Work order", match: (p) => /^\/workshop\/jobs\/[^/]+$/.test(p), steps: () => jobDetailTour },
  { key: "jobs-list", label: "Jobs list", match: (p) => p === "/workshop/jobs", steps: () => jobsListTour },
  { key: "customers", label: "Customers", match: (p) => p === "/customers", steps: () => customersTour },
  { key: "vehicles", label: "Vehicles", match: (p) => p === "/vehicles", steps: () => vehiclesTour },
  { key: "parts", label: "Parts", match: (p) => p === "/inventory/parts", steps: () => partsTour },
  { key: "invoices", label: "Invoices", match: (p) => p === "/billing/invoices", steps: () => invoicesListTour },
  { key: "appointments", label: "Appointments", match: (p) => p === "/workshop/appointments", steps: () => appointmentsTour },
  { key: "reports", label: "Reports", match: (p) => p === "/reports", steps: () => reportsTour },
  { key: "safety", label: "Safety", match: (p) => p === "/safety", steps: () => safetyTour },
  { key: "settings", label: "Settings", match: (p) => p === "/settings" || p.startsWith("/settings/"), steps: () => settingsTour },
  { key: "checkin", label: "Check-in", match: (p) => p === "/workshop/check-in", steps: () => checkinTour, wizardDriven: true },
  { key: "payment", label: "Taking payment", match: (p) => /^\/billing\/invoices\/[^/]+$/.test(p), steps: () => paymentTour },
];

export const ALL_TOURS = [APP_OVERVIEW, ...ROUTE_TOURS];

export function tourForPath(path: string, role: MembershipRole): TourDef | undefined {
  return ROUTE_TOURS.find((t) => t.match(path, role));
}
