import React from "react";
import { AppBreadcrumbs } from "@/components/layout/AppBreadcrumbs";
import { cn } from "@/lib/utils";

interface ModuleHeaderProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  /** Show the brand accent bar on the left (default: true) */
  accent?: boolean;
  /** Actions slot — buttons/toolbar rendered on the right */
  actions?: React.ReactNode;
  /** Override breadcrumb rendering (default: true) */
  breadcrumb?: boolean;
  className?: string;
}

export function ModuleHeader({
  title,
  subtitle,
  icon,
  accent = true,
  actions,
  breadcrumb = true,
  className,
}: ModuleHeaderProps) {
  return (
    <div className={cn("mb-6 space-y-2", className)}>
      {breadcrumb && <AppBreadcrumbs />}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          {accent && (
            <div className="w-1 self-stretch rounded-full bg-primary shrink-0 mt-1" />
          )}
          <div className="flex items-start gap-3">
            {icon && (
              <div className="shrink-0 mt-0.5">{icon}</div>
            )}
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
              {subtitle && (
                <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
              )}
            </div>
          </div>
        </div>
        {actions && (
          <div className="flex items-center gap-2 shrink-0">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
