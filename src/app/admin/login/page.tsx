import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { LoginForm } from "@/components/admin/login-form";
import { BrandLogo } from "@/components/brand-logo";
import { getAdminContext } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Iniciar sesión" };

export default function AdminLoginPage() {
  return (
    <main id="contenido" className="flex flex-1 items-center justify-center bg-background-secondary px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-3">
          <BrandLogo size={48} />
          <span className="flex flex-col leading-tight">
            <span className="text-base font-semibold">Abarrotes Alex</span>
            <span className="text-sm text-muted-foreground">Panel administrativo</span>
          </span>
        </div>

        <div className="rounded-xl border bg-card p-6 shadow-card">
          <h1 className="text-2xl font-semibold tracking-tight">Iniciar sesión</h1>
          <p className="mt-1 mb-5 text-sm text-muted-foreground">Acceso exclusivo para el personal de la tienda.</p>
          <Suspense fallback={<div className="h-56 animate-pulse rounded-lg bg-muted" />}>
            <LoginGate />
          </Suspense>
        </div>

        <p className="mt-4 text-center text-sm">
          <Link href="/" className="inline-flex min-h-10 items-center rounded-lg px-2 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            Volver a la tienda
          </Link>
        </p>
      </div>
    </main>
  );
}

// Con sesión válida no se muestra el formulario (el proxy ya redirige en el caso común).
async function LoginGate() {
  const context = await getAdminContext();
  if (context?.role === "admin") redirect("/admin");
  if (context) redirect("/admin/sin-acceso");
  return <LoginForm />;
}
