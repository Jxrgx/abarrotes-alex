import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

type SectionHeaderProps = {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  action?: { href: string; label: string };
};

export function SectionHeader({ id, title, description, action }: SectionHeaderProps) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div className="min-w-0">
        <h2 id={id} className="text-2xl font-semibold tracking-tight md:text-3xl">
          {title}
        </h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action && (
        <Link
          href={action.href}
          className="inline-flex h-10 shrink-0 items-center gap-0.5 rounded-lg text-sm font-medium text-primary transition-colors duration-150 hover:text-primary-hover"
        >
          {action.label}
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}
