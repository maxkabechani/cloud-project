"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Layers3, Server } from "lucide-react";
import { APP_NAME, type CurrentUser } from "@hpc/shared";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

export type DashboardNavItem = {
  section: string;
  label: string;
  icon: LucideIcon;
};

export function AppSidebar({
  section,
  user,
  nav,
}: {
  section: string;
  user: CurrentUser;
  nav: DashboardNavItem[];
}) {
  return (
    <Sidebar>
      <SidebarHeader>
        <Link href="/dashboard" className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-semibold text-slate-950">
          <span className="grid size-8 place-items-center rounded-lg bg-cyan-800 text-white">
            <Layers3 size={17} />
          </span>
          <span className="truncate">{APP_NAME}</span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <p className="px-3 pb-1 pt-3 text-[10px] font-bold tracking-[0.16em] text-slate-400">WORKSPACE</p>
        <SidebarMenu>
          {nav.map(({ section: item, label, icon: Icon }) => (
            <SidebarMenuItem key={item}>
              <SidebarMenuButton asChild isActive={section === item}>
                <Link href={item === "overview" ? "/dashboard" : `/dashboard/${item}`}>
                  <Icon size={17} />
                  <span>{label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter>
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-cyan-100 text-xs font-bold text-cyan-900">
            {user.name.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-slate-800">{user.name}</p>
            <p className="truncate text-[11px] text-slate-500">{user.email}</p>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2 px-2 text-[11px] text-slate-500">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          <Server size={13} className="text-cyan-700" /> Workspace online
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
