import { type NextRequest, NextResponse } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

const LOGIN_PATH = "/admin/login";

// Proxy (Next.js 16): solo para /admin. Refresca la sesión y hace redirecciones
// optimistas. La autorización real (profiles.role) se comprueba en el servidor
// al renderizar (requireAdmin) y en la base de datos (RLS).
export async function proxy(request: NextRequest) {
  const { response, isAuthenticated } = await updateSession(request);
  const { pathname } = request.nextUrl;
  const onLogin = pathname === LOGIN_PATH;

  let result = response;
  if (!isAuthenticated && !onLogin) {
    result = redirectWithCookies(request, LOGIN_PATH, response);
  } else if (isAuthenticated && onLogin) {
    result = redirectWithCookies(request, "/admin", response);
  }

  // Páginas administrativas: nunca en caché (tampoco al volver con "Atrás").
  result.headers.set("Cache-Control", "private, no-store");
  return result;
}

// Conserva las cookies refrescadas en la redirección.
function redirectWithCookies(request: NextRequest, path: string, from: NextResponse) {
  const redirect = NextResponse.redirect(new URL(path, request.url));
  from.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
