"use client";

import type { ReactNode } from "react";
import type { CurrentUser } from "@hpc/shared";
import { AppSidebar, type DashboardNavItem } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export function Dashboard01({
  children,
  nav,
  section,
  sectionLabel,
  user,
  onLogout,
}: {
  children: ReactNode;
  nav: DashboardNavItem[];
  section: string;
  sectionLabel: string;
  user: CurrentUser;
  onLogout: () => void;
}) {
  return (
    <SidebarProvider>
      <AppSidebar nav={nav} section={section} user={user} />
      <SidebarInset>
        <SiteHeader sectionLabel={sectionLabel} userName={user.name} onLogout={onLogout} />
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-4 px-4 py-5 md:gap-6 md:px-6 md:py-6">
              {children}
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
