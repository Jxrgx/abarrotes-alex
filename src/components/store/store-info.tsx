import { Clock, MapPin, Phone, Store } from "lucide-react";
import type { ReactNode } from "react";

import type { Branch } from "@/lib/catalog/branches";
import type { HoursGroup } from "@/lib/catalog/hours";
import { formatPhone } from "@/lib/format";

type StoreInfoProps = {
  branch: Branch;
  hours: HoursGroup[];
};

// Dirección, teléfono y horario. Sin coordenadas ni datos técnicos.
export function StoreInfo({ branch, hours }: StoreInfoProps) {
  return (
    <div className="grid gap-3 md:grid-cols-2 md:gap-4">
      <InfoCard icon={Store} title="Sucursal">
        <p className="font-medium text-foreground">{branch.name}</p>
        <dl className="mt-3 space-y-2 text-sm">
          {branch.address && (
            <div className="flex gap-2">
              <dt>
                <MapPin className="mt-0.5 size-4 text-muted-foreground" aria-hidden="true" />
                <span className="sr-only">Dirección</span>
              </dt>
              <dd className="text-muted-foreground">{branch.address}</dd>
            </div>
          )}
          {branch.phone && (
            <div className="flex items-center gap-2">
              <dt>
                <Phone className="size-4 text-muted-foreground" aria-hidden="true" />
                <span className="sr-only">Teléfono</span>
              </dt>
              <dd>
                <a
                  href={`tel:${branch.phone}`}
                  className="inline-flex min-h-10 items-center rounded-md font-medium text-primary underline-offset-4 hover:text-primary-hover hover:underline"
                >
                  {formatPhone(branch.phone)}
                </a>
              </dd>
            </div>
          )}
        </dl>
      </InfoCard>

      <InfoCard icon={Clock} title="Horarios">
        {hours.length > 0 ? (
          <dl className="divide-y divide-border-subtle text-sm">
            {hours.map((group) => (
              <div key={group.days} className="flex justify-between gap-4 py-2 first:pt-0 last:pb-0">
                <dt className="text-foreground">{group.days}</dt>
                <dd className="text-right text-muted-foreground tabular-nums">{group.hours}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">Horario por confirmar.</p>
        )}
      </InfoCard>
    </div>
  );
}

function InfoCard({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Store;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 md:p-5">
      <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold">
        <Icon className="size-5 text-primary" aria-hidden="true" />
        {title}
      </h3>
      {children}
    </div>
  );
}

