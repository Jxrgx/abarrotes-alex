"use client";

import { Tag } from "lucide-react";

import { type PriceRules, wholesaleCardText, wholesaleHint } from "@/lib/catalog/pricing";
import { useCartQuantity } from "@/lib/cart/store";
import { formatCents } from "@/lib/format";
import { cn } from "@/lib/utils";

type WholesaleHintProps = {
  productId: string;
  rules: PriceRules;
  /** Agotado: solo informa el primer nivel (no depende del carrito). */
  static?: boolean;
  className?: string;
};

// Línea compacta de mayoreo en la tarjeta. Se adapta a la cantidad que ya está en el
// carrito ("agrega 1 más…", "aplicado"). Informativa: el precio lo decide la base. No es
// región aria-live: los cambios relevantes los anuncia AddToCart (sin repetir en cada clic).
export function WholesaleHint({ productId, rules, static: isStatic = false, className }: WholesaleHintProps) {
  const inCart = useCartQuantity(productId);
  const quantity = isStatic ? 0 : (inCart ?? 0);
  const hint = wholesaleHint(rules, quantity);
  if (!hint) return null;

  const text = wholesaleCardText(hint, quantity, formatCents);
  const rest = text.replace(/^Mayoreo/, "");

  return (
    <p
      className={cn(
        "flex items-start gap-1.5 rounded-md bg-primary-soft px-2 py-1 text-xs leading-4 text-primary-dark",
        className,
      )}
    >
      <Tag className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
      <span>
        <span className="font-semibold">Mayoreo</span>
        {rest}
      </span>
    </p>
  );
}
