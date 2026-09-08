"use client";

import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

export function SiteHeader({
  sectionLabel,
  userName,
  onLogout,
}: {
  sectionLabel: string;
  userName: string;
  onLogout: () => void;
}) {
  return (
    <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 md:px-6">
      <div className="flex items-center gap-3">
        <SidebarTrigger />
        <Separator orientation="vertical" className="hidden md:block" />
        <div className="text-sm text-slate-500">
          <span className="hidden sm:inline">Workspace / </span>
          <span className="font-semibold text-slate-900">{sectionLabel}</span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="hidden text-sm font-medium text-slate-700 sm:inline">{userName}</span>
        <Button variant="outline" size="sm" onClick={onLogout}>
          <LogOut size={15} />
          <span className="hidden sm:inline">Sign out</span>
        </Button>
      </div>
    </header>
  );
}
