import "server-only";

import { unstable_rethrow } from "next/navigation";

// Carga de datos de una sección del panel: un error de consulta se convierte en
// estado (mensaje + reintentar) en lugar de romper la página o cerrar la sesión.
// Las señales internas de Next.js (render dinámico, redirect) se vuelven a lanzar.
// La carga ocurre aquí y el JSX se arma fuera del try/catch.
export async function loadAdminSection<T>(load: () => Promise<T>): Promise<{ ok: true; data: T } | { ok: false }> {
  try {
    return { ok: true, data: await load() };
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false };
  }
}
