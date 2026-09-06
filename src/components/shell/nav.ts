import type { Capability } from "@/lib/permissions";

export interface NavItem {
  label: string;
  href: string;
  /** capability required to see this item; omit = any member */
  cap?: Capability;
  /** match child routes too */
  exact?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", href: "/dashboard", cap: "reports.view" },
      { label: "My jobs", href: "/workshop/my-jobs", cap: "task.workOwn" },
      { label: "Notifications", href: "/notifications" },
    ],
  },
  {
    label: "Workshop",
    items: [
      { label: "Check-in", href: "/workshop/check-in", cap: "vehicle.checkin" },
      { label: "Active jobs", href: "/workshop/jobs" },
      { label: "Appointments", href: "/workshop/appointments", cap: "customer.manage" },
    ],
  },
  {
    label: "Records",
    items: [
      { label: "Customers", href: "/customers" },
      { label: "Vehicles", href: "/vehicles" },
      { label: "Technicians", href: "/technicians", cap: "workorder.assign" },
    ],
  },
  {
    label: "Inventory",
    items: [
      { label: "Parts", href: "/inventory/parts", cap: "inventory.view" },
      { label: "Suppliers", href: "/inventory/suppliers", cap: "inventory.manage" },
    ],
  },
  {
    label: "Billing",
    items: [
      { label: "Invoices", href: "/billing/invoices", cap: "invoice.manage" },
      { label: "Payments", href: "/billing/payments", cap: "payment.record" },
    ],
  },
  {
    label: "Insight",
    items: [
      { label: "Reports", href: "/reports", cap: "reports.view" },
      { label: "Audit log", href: "/audit", cap: "audit.view" },
    ],
  },
  {
    label: "Configure",
    items: [
      { label: "Services & pricing", href: "/settings/services", cap: "service.manage" },
      { label: "Staff", href: "/settings/staff", cap: "staff.manage" },
      { label: "Settings", href: "/settings", cap: "settings.manage" },
    ],
  },
];
