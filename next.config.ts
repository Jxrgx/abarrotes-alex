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

const nextConfig: NextConfig = {
  /* config options here */
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
