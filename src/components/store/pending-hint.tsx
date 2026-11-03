"use client";

import { LoaderCircle } from "lucide-react";
import { useLinkStatus } from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

// Feedback discreto dentro de un <Link>: mientras la navegación está pendiente
// muestra un spinner en lugar del icono (o junto al texto si no hay icono).
export function PendingHint({ children, className }: { children?: ReactNode; className?: string }) {
  const { pending } = useLinkStatus();
  if (!pending) return children ?? null;
  return <Spinner className={className} />;
}

export function Spinner({ className }: { className?: string }) {
  return (
    <LoaderCircle
      className={cn("size-4 shrink-0 animate-spin text-muted-foreground", className)}
      aria-hidden="true"
    />
  );
}
