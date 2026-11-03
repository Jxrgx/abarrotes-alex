import { ChevronDown } from "lucide-react";

import { SectionHeader } from "./section-header";

// Contenido fijo del MVP.
const FAQ_ITEMS = [
  {
    question: "¿Realizan entregas a domicilio?",
    answer: "Sí. El costo de envío se confirma al procesar el pedido.",
  },
  {
    question: "¿Puedo recoger mi pedido?",
    answer: "Sí, puedes seleccionar recoger en sucursal al realizar tu pedido.",
  },
  {
    question: "¿Qué métodos de pago aceptan?",
    answer: "Inicialmente aceptamos pago en efectivo.",
  },
  {
    question: "¿Qué ocurre si un producto está agotado?",
    answer: "Los productos agotados se muestran identificados y no pueden agregarse al pedido.",
  },
];

// <details>/<summary> nativos: accesibles por teclado y sin JavaScript de cliente.
export function Faq() {
  return (
    <section aria-labelledby="faq-title" className="page-container py-8 md:py-12">
      <SectionHeader id="faq-title" title="Preguntas frecuentes" />
      <div className="divide-y divide-border rounded-xl border bg-card">
        {FAQ_ITEMS.map((item) => (
          <details key={item.question} className="group">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 rounded-xl px-4 py-3 text-base font-medium transition-colors duration-150 hover:bg-background-secondary md:px-5 [&::-webkit-details-marker]:hidden">
              {item.question}
              <ChevronDown
                className="size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
                aria-hidden="true"
              />
            </summary>
            <p className="px-4 pb-4 text-sm text-muted-foreground md:px-5">{item.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
