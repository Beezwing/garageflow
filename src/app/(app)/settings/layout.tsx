import { redirect } from "next/navigation";
import { requireGarageContext } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { SettingsTabs } from "./SettingsTabs";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireGarageContext();
  if (!can(ctx.role, "settings.manage") && !can(ctx.role, "staff.manage")) {
    redirect("/dashboard");
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-text">Settings</h1>
      <SettingsTabs
        tabs={[
          { label: "Business", href: "/settings" },
          { label: "Services & pricing", href: "/settings/services" },
          { label: "Checklists", href: "/settings/checklists" },
          { label: "Safety", href: "/settings/safety" },
          { label: "Payments", href: "/settings/payments" },
          { label: "Staff", href: "/settings/staff" },
          { label: "Subscription", href: "/settings/subscription" },
        ]}
      />
      <div className="mt-6">{children}</div>
    </div>
  );
}
