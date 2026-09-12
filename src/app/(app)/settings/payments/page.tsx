import { redirect } from "next/navigation";
import { requireGarageContext } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getDimePayStatus } from "@/lib/actions/payments-providers";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/primitives";
import { DimePaySettings } from "./DimePaySettings";

export const metadata = { title: "Payments" };

export default async function PaymentsSettingsPage() {
  const ctx = await requireGarageContext();
  if (!can(ctx.role, "settings.manage")) redirect("/settings");

  const status = await getDimePayStatus();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>DimePay</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="mb-4 text-sm text-text-muted">
            Connect your own DimePay merchant account and customers can pay an invoice online — the balance
            clears automatically the moment DimePay confirms it, no need to check in with us. Get your API
            key and signing secret from your DimePay dashboard&rsquo;s Developer section.
          </p>
          <DimePaySettings initial={status} />
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <p className="text-sm text-text-muted">
            More payment providers are coming here as they become available — this page is built to hold
            them without changing how DimePay works for you.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
