import type { NextConfig } from "next";

// Host exacto del proyecto de Supabase (de NEXT_PUBLIC_SUPABASE_URL, que no es
// secreto). Si no está definido en build, se cae a *.supabase.co restringido igual
// al path público del bucket de productos.
const supabaseHost = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname || "*.supabase.co";
  } catch {
    return "*.supabase.co";
  }
})();

// ---------------------------------------------------------------------------
// Headers de seguridad (Fase 9A, docs/security.md). CSP ESTÁTICA (sin nonce): una CSP
// con nonce obliga a renderizar cada página dinámicamente, incompatible con
// cacheComponents/PPR. Por eso script-src permite 'unsafe-inline' (scripts inline de
// Next.js) pero ningún origen externo; lo fuerte está en frame-ancestors, object-src,
// base-uri, form-action y en limitar conexiones/imágenes a la app y al proyecto Supabase.
// En desarrollo se agregan 'unsafe-eval' y ws: (React/Turbopack los necesitan).
const isDev = process.env.NODE_ENV === "development";
const supabaseOrigin = supabaseHost.startsWith("*") ? "https://*.supabase.co" : `https://${supabaseHost}`;
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${supabaseOrigin}`,
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseOrigin}${isDev ? " ws: wss:" : ""}`,
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  // Anti-clickjacking también para navegadores sin frame-ancestors.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // No filtra rutas (/admin/pedidos?q=…, /pedido/ALEX-…) a sitios externos como wa.me.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // Solo tiene efecto sobre HTTPS (los navegadores lo ignoran en http://localhost).
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

// PREPRODUCCIÓN (Fase 9D): el catálogo todavía es de prueba, así que ninguna página se
// indexa (cabecera X-Robots-Tag en todas las respuestas; la navegación no cambia).
// Lanzamiento definitivo: cambiar a `true` y desplegar (docs/production.md §23).
// Las páginas privadas (/admin, carrito, checkout, pedido) siguen con su propio noindex.
const SEARCH_INDEXING_ENABLED = false;

const nextConfig: NextConfig = {
  /* config options here */
  poweredByHeader: false,
  async headers() {
    const headers = SEARCH_INDEXING_ENABLED
      ? securityHeaders
      : [...securityHeaders, { key: "X-Robots-Tag", value: "noindex, nofollow" }];
    return [{ source: "/:path*", headers }];
  },
  cacheComponents: true,
  partialPrefetching: true,
  images: {
    // Solo imágenes públicas del bucket product-images (Fase 8C.2).
    remotePatterns: [
      {
        protocol: "https",
        hostname: supabaseHost,
        pathname: "/storage/v1/object/public/product-images/**",
      },
    ],
  },
  experimental: {
    // Fotos de producto (máx. 10 MB + overhead multipart) en la Server Action del
    // panel. La acción exige requireAdmin() antes de procesar el archivo.
    serverActions: { bodySizeLimit: "11mb" },
    // /admin pasa por proxy.ts, que guarda el cuerpo en memoria (10 MB por defecto).
    proxyClientMaxBodySize: "11mb",
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
