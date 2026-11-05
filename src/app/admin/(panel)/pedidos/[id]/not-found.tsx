import { SearchX } from "lucide-react";
import Link from "next/link";

// Pedido inexistente, id inválido o fuera de permisos: misma respuesta (no revela nada).
export default function OrderNotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-xl border border-dashed bg-card px-6 py-10 text-center">
      <span className="flex size-11 items-center justify-center rounded-xl bg-background-secondary">
        <SearchX className="size-5 text-muted-foreground" aria-hidden="true" />
      </span>
      <h1 className="font-semibold">No encontramos este pedido.</h1>
      <p className="text-sm text-muted-foreground">Puede que el enlace sea incorrecto.</p>
      <Link href="/admin/pedidos" className="inline-flex h-10 items-center rounded-lg border border-input bg-background px-4 text-sm font-medium hover:bg-accent">
        Ver todos los pedidos
      </Link>
    </div>
  );
}
