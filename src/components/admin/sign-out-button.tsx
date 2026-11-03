"use client";

import { LoaderCircle, LogOut } from "lucide-react";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth/actions";
import { cn } from "@/lib/utils";

// Cierra la sesión y hace una navegación completa con replace: se descarta el
// estado del panel en memoria y "Atrás" no vuelve a una vista con datos.
export function SignOutButton({ compact = false, className }: { compact?: boolean; className?: string }) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      try {
        await signOut();
      } finally {
        window.location.replace("/admin/login");
      }
    });
  }

  return (
    <Button
      variant="ghost"
      onClick={handleClick}
      disabled={pending}
      aria-label={compact ? "Cerrar sesión" : undefined}
      className={cn(compact ? "size-10 px-0" : "w-full justify-start px-3", "text-muted-foreground", className)}
    >
      {pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <LogOut aria-hidden="true" />}
      {!compact && "Cerrar sesión"}
    </Button>
  );
}
