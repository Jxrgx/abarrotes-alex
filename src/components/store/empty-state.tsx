import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
};

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed bg-background-secondary px-6 py-12 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-background ring-1 ring-border">
        <Icon className="size-6 text-muted-foreground" aria-hidden="true" />
      </span>
      <p className="mt-4 text-lg font-semibold">{title}</p>
      {description && <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
