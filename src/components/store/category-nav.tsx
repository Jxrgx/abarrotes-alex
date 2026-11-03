import {
  Cookie,
  CupSoda,
  LayoutGrid,
  type LucideIcon,
  Milk,
  Popcorn,
  ShoppingBasket,
  SprayCan,
} from "lucide-react";
import Link from "next/link";

import type { Category } from "@/lib/catalog/categories";
import { cn } from "@/lib/utils";

// Representación visual por slug. Las categorías nuevas usan el icono genérico.
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  bebidas: CupSoda,
  galletas: Cookie,
  lacteos: Milk,
  botanas: Popcorn,
  limpieza: SprayCan,
};

type CategoryNavProps = {
  categories: Category[];
  /** Slug seleccionado en /productos. null = "Todos". undefined = sin selección (home). */
  activeSlug?: string | null;
  showAll?: boolean;
  label?: string;
};

export function CategoryNav({
  categories,
  activeSlug,
  showAll = false,
  label = "Categorías",
}: CategoryNavProps) {
  return (
    <nav aria-label={label}>
      <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0 md:pb-0">
        {showAll && (
          <li className="shrink-0">
            <CategoryChip href="/productos" icon={LayoutGrid} active={activeSlug === null}>
              Todos
            </CategoryChip>
          </li>
        )}
        {categories.map((category) => (
          <li key={category.id} className="shrink-0">
            <CategoryChip
              href={`/productos?categoria=${encodeURIComponent(category.slug)}`}
              icon={CATEGORY_ICONS[category.slug] ?? ShoppingBasket}
              active={activeSlug === category.slug}
            >
              {category.name}
            </CategoryChip>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function CategoryChip({
  href,
  icon: Icon,
  active,
  children,
}: {
  href: string;
  icon: LucideIcon;
  active: boolean;
  children: string;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-11 items-center gap-2 rounded-lg border py-1 pr-4 pl-1.5 text-sm font-medium whitespace-nowrap transition-colors duration-150",
        active
          ? "border-primary bg-primary-soft text-primary-dark"
          : "bg-background text-foreground hover:border-input hover:bg-background-secondary",
      )}
    >
      <span
        className={cn(
          "flex size-8 items-center justify-center rounded-md",
          active ? "bg-background text-primary" : "bg-background-secondary text-muted-foreground",
        )}
        aria-hidden="true"
      >
        <Icon className="size-4" />
      </span>
      {children}
    </Link>
  );
}
