import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";

import { DashboardError, DashboardSkeleton, DashboardView } from "@/components/admin/dashboard";
import { getAdminBranch, getDashboardData } from "@/lib/admin/dashboard";
import { requireAdmin } from "@/lib/auth/session";
import { branchShortName } from "@/lib/catalog/branches";

export const metadata: Metadata = { title: "Inicio" };

// requireAdmin también aquí: layouts y páginas se renderizan en paralelo, así que
// cada página protegida verifica por sí misma (la llamada se reutiliza por request).
export default async function AdminHomePage() {
  const context = await requireAdmin();
  const firstName = context.fullName?.trim().split(/\s+/)[0];

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Hola{firstName ? `, ${firstName}` : ""}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Este es el resumen de Abarrotes Alex.</p>
      </div>
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardSection />
      </Suspense>
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
