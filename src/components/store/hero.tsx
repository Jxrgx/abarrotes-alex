import { ArrowDown, Banknote, Store, Truck } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";

const HIGHLIGHTS = [
  { icon: Truck, label: "Entrega a domicilio" },
  { icon: Store, label: "Recoge en sucursal" },
  { icon: Banknote, label: "Pago en efectivo" },
];

// Hero compacto: la prioridad es llegar rápido a categorías y productos.
export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="page-container pt-4 md:pt-6">
      <div className="rounded-xl border border-primary-soft bg-primary-subtle px-5 py-6 md:flex md:items-center md:justify-between md:gap-8 md:px-8 md:py-8">
        <div className="max-w-2xl">
          <h1
            id="hero-title"
            className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl"
          >
            Todo lo que necesitas, cerca de ti
          </h1>
          <p className="mt-2 text-base text-muted-foreground">
            Explora nuestros productos y prepara tu pedido para enviarlo por WhatsApp.
          </p>
          <ul className="mt-4 hidden flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground sm:flex">
            {HIGHLIGHTS.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-1.5">
                <Icon className="size-4 text-primary" aria-hidden="true" />
                {label}
              </li>
            ))}
          </ul>
        </div>
        <a
          href="#productos"
          className={buttonVariants({ size: "lg", className: "mt-5 w-full sm:w-auto md:mt-0" })}
        >
          Ver productos
          <ArrowDown aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}
