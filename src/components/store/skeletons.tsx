import { cn } from "@/lib/utils";

function Bone({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} />;
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: count }, (_, index) => (
        <li key={index} className="overflow-hidden rounded-xl border bg-card">
          <Bone className="aspect-square rounded-none" />
          <div className="space-y-2 p-3">
            <Bone className="h-4 w-4/5" />
            <Bone className="h-4 w-1/2" />
            <Bone className="h-5 w-1/3" />
            <Bone className="mt-3 h-10 w-full rounded-lg" />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function CategoryNavSkeleton() {
  return (
    <div className="flex gap-2 overflow-hidden">
      {Array.from({ length: 5 }, (_, index) => (
        <Bone key={index} className="h-11 w-32 shrink-0 rounded-lg" />
      ))}
    </div>
  );
}

export function CatalogSkeleton() {
  return (
    <div role="status" aria-label="Cargando productos" className="page-container space-y-8 py-6">
      <div className="space-y-4">
        <Bone className="h-7 w-40" />
        <CategoryNavSkeleton />
      </div>
      <div className="space-y-4">
        <Bone className="h-7 w-52" />
        <ProductGridSkeleton />
      </div>
    </div>
  );
}

export function StoreInfoSkeleton() {
  return (
    <div className="grid gap-3 md:grid-cols-2 md:gap-4">
      <Bone className="h-44 rounded-xl" />
      <Bone className="h-44 rounded-xl" />
    </div>
  );
}
