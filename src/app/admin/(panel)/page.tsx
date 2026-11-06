import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";

import { AdminGuard } from "@/components/admin/admin-guard";
import { DashboardError, DashboardSkeleton, DashboardView } from "@/components/admin/dashboard";
import { NotificationsCard } from "@/components/admin/notifications-card";
import { getAdminBranch, getDashboardData } from "@/lib/admin/dashboard";
import { requireAdmin } from "@/lib/auth/session";
import { branchShortName } from "@/lib/catalog/branches";

export const metadata: Metadata = { title: "Inicio" };

// La verificación de admin de la página ocurre dentro de AdminGuard (su propio
// <Suspense>): así la navegación desde otro módulo no se bloquea.
export default function AdminHomePage() {
  return (
    <div className="mx-auto max-w-6xl">
      <AdminGuard fallback={<GreetingSkeleton />}>
        <DashboardContent />
      </AdminGuard>
    </div>
  );
}

async function DashboardContent() {
  const context = await requireAdmin(); // ya verificado por AdminGuard; cache() por request
  const firstName = context.fullName?.trim().split(/\s+/)[0];
  return (
    <>
      <div className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Hola{firstName ? `, ${firstName}` : ""}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Este es el resumen de Abarrotes Alex.</p>
      </div>
      <NotificationsCard />
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardSection />
      </Suspense>
    </>
  );
}

function GreetingSkeleton() {
  return (
    <div role="status" aria-label="Cargando resumen">
      <div className="mb-5 space-y-2">
        <div className="h-8 w-48 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-64 animate-pulse rounded-md bg-muted" />
      </div>
      <DashboardSkeleton />
    </div>
  );
}

// Un error de consulta no cierra la sesión: se muestra un mensaje y se puede reintentar.
async function DashboardSection() {
  const result = await loadDashboard();
  if (result.status === "error") return <DashboardError />;
  if (result.status === "no-branch") {
    return <p className="text-sm text-muted-foreground">Aún no hay sucursales configuradas.</p>;
  }
  return <DashboardView data={result.data} branchName={branchShortName(result.branch.name)} />;
}

async function loadDashboard() {
  try {
    const branch = await getAdminBranch();
    if (!branch) return { status: "no-branch" as const };
    return { status: "ok" as const, branch, data: await getDashboardData(branch.id) };
  } catch (error) {
    unstable_rethrow(error); // señales internas de Next.js (render dinámico, redirecciones)
    return { status: "error" as const };
  }
}
