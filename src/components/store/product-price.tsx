import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

type ProductPriceProps = {
  price: number;
  promoPrice: number | null;
  /** "kg" en venta por peso. */
  priceUnit: string | null;
  muted?: boolean;
};

export function ProductPrice({ price, promoPrice, priceUnit, muted = false }: ProductPriceProps) {
  const unitSuffix = priceUnit ? (
    <span className="text-xs font-normal text-muted-foreground">/{priceUnit}</span>
  ) : null;

  if (promoPrice === null) {
    return (
      <p className={cn("text-base font-semibold tabular-nums", muted && "text-muted-foreground")}>
        {formatPrice(price)}
        {unitSuffix}
      </p>
    );
  }

  return (
    <p className="flex flex-wrap items-baseline gap-x-1.5 tabular-nums">
      <span
        className={cn(
          "text-base font-semibold",
          muted ? "text-muted-foreground" : "text-destructive-strong",
        )}
      >
        <span className="sr-only">Precio de oferta: </span>
        {formatPrice(promoPrice)}
        {unitSuffix}
      </span>
      <s className="text-sm text-subtle-foreground">
        <span className="sr-only">Precio anterior: </span>
        {formatPrice(price)}
      </s>
    </p>
  );
}
