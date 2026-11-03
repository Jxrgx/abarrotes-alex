import { CategoryNavSkeleton, ProductGridSkeleton } from "@/components/store/skeletons";

export default function Loading() {
  return (
    <div role="status" aria-label="Cargando productos" className="page-container py-6 md:py-8">
      <div className="mb-4 h-9 w-56 animate-pulse rounded-md bg-muted md:mb-6 md:h-10" />
      <div className="mb-6">
        <CategoryNavSkeleton />
      </div>
      <ProductGridSkeleton />
    </div>
  );
}
