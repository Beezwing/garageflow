import Link from "next/link";
import { BrandMark } from "@/components/ui/BrandMark";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-bg px-4 py-10">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-6 flex items-center gap-2">
          <BrandMark size={36} />
          <span className="text-lg font-semibold text-text">GarageFlow</span>
        </Link>
        {children}
      </div>
      <p className="mt-8 text-xs text-text-subtle">
        GarageFlow — digital job cards, inspections, billing &amp; vehicle history
      </p>
    </div>
  );
}
