/** The GarageFlow gear-and-car mark. A plain image, not next/image — it's a
 * tiny static asset reused in a handful of headers, not worth the wiring. */
export function BrandMark({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/icons/mark-96.png"
      alt="GarageFlow"
      width={size}
      height={size}
      className={`shrink-0 rounded-lg bg-white object-contain ${className}`}
    />
  );
}
