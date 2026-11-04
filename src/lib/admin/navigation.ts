import {
  Award,
  ClipboardList,
  House,
  type LucideIcon,
  Package,
  Shapes,
  Store,
  Tag,
  Tags,
} from "lucide-react";

// Navegación del panel. Única definición para sidebar (desktop) y menú (móvil).

export type AdminNavItem = { label: string; href: string; icon: LucideIcon };
export type AdminNavGroup = { label?: string; items: AdminNavItem[] };

export const ADMIN_NAV: AdminNavGroup[] = [
  {
    items: [
      { label: "Inicio", href: "/admin", icon: House },
      { label: "Pedidos", href: "/admin/pedidos", icon: ClipboardList },
      { label: "Productos", href: "/admin/productos", icon: Package },
    ],
  },
  {
    label: "Catálogo",
    items: [
      { label: "Categorías", href: "/admin/categorias", icon: Shapes },
      { label: "Subcategorías", href: "/admin/subcategorias", icon: Tags },
      { label: "Marcas", href: "/admin/marcas", icon: Award },
    ],
  },
  {
    items: [
      { label: "Promociones", href: "/admin/promociones", icon: Tag },
      { label: "Sucursales", href: "/admin/sucursales", icon: Store },
    ],
  },
];

// Inicio solo está activo exactamente en /admin; los módulos también en sus
// subrutas (/admin/pedidos/[id] → Pedidos).
export function isAdminNavActive(href: string, pathname: string) {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}
