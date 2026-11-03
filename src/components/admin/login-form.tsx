"use client";

import { AlertCircle, LoaderCircle } from "lucide-react";
import { type FormEvent, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { controlClassName } from "@/components/ui/field";
import { signIn } from "@/lib/auth/actions";
import { cn } from "@/lib/utils";

// La contraseña se envía a la Server Action y no se guarda en ningún storage.
export function LoginForm() {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const formData = new FormData(event.currentTarget);
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await signIn(formData);
        if (result.ok) {
          // Navegación completa: el panel se renderiza con las cookies nuevas.
          window.location.replace("/admin");
          return;
        }
        setMessage(result.message);
      } catch {
        setMessage("No pudimos conectar. Revisa tu conexión e inténtalo de nuevo.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" aria-describedby={message ? "login-error" : undefined}>
      <div className="space-y-1.5">
        <label htmlFor="login-email" className="block text-sm font-medium">
          Correo electrónico
        </label>
        <input
          id="login-email"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          required
          className={cn(controlClassName, "h-11")}
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="login-password" className="block text-sm font-medium">
          Contraseña
        </label>
        <input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={cn(controlClassName, "h-11")}
        />
      </div>

      {message && (
        <p id="login-error" role="alert" className="flex items-start gap-2 rounded-lg bg-destructive-soft p-3 text-sm text-destructive-strong">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {message}
        </p>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={pending} aria-busy={pending}>
        {pending ? (
          <>
            <LoaderCircle className="animate-spin" aria-hidden="true" />
            Iniciando sesión…
          </>
        ) : (
          "Iniciar sesión"
        )}
      </Button>
    </form>
  );
}
