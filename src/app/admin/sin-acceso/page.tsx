import { ShieldX } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { SignOutButton } from "@/components/admin/sign-out-button";
import { getAdminContext } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Sin acceso" };

export default function NoAccessPage() {
  return (
    <main id="contenido" className="flex flex-1 items-center justify-center bg-background-secondary px-4 py-12">
      <Suspense fallback={<div className="h-64 w-full max-w-sm animate-pulse rounded-xl bg-muted" />}>
        <NoAccess />
      </Suspense>
    </main>
  );
}

// Usuario autenticado sin rol de administrador (sin profile o employee).
async function NoAccess() {
  const context = await getAdminContext();
  if (!context) redirect("/admin/login");
  if (context.role === "admin") redirect("/admin");

  return (
    <div className="w-full max-w-sm rounded-xl border bg-card p-6 text-center shadow-card">
      <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-destructive-soft">
        <ShieldX className="size-6 text-destructive-strong" aria-hidden="true" />
      </span>
      <h1 className="mt-4 text-xl font-semibold">Sin acceso al panel</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Tu cuenta no tiene permisos de administración. Si crees que es un error, contacta al administrador de la tienda.
      </p>
      <div className="mt-5 rounded-lg border">
        <SignOutButton className="justify-center" />
      </div>
    </div>
  );
}
