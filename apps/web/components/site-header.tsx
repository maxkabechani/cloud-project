"use client";

import { Bell, LogOut } from "lucide-react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Notification } from "@hpc/shared";
import { API_URL } from "@/lib/auth-client";
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
  const [open, setOpen] = useState(false);
  const client = useQueryClient();
  const notifications = useQuery({ queryKey: ["notifications"], queryFn: async () => { const response = await fetch(`${API_URL}/api/notifications`, { credentials: "include", cache: "no-store" }); if (!response.ok) throw new Error("Notifications unavailable"); return (await response.json()) as { notifications: Notification[] }; }, refetchInterval: 10000 });
  const markRead = useMutation({ mutationFn: async (id: string) => fetch(`${API_URL}/api/notifications/${id}/read`, { method: "POST", credentials: "include" }), onSuccess: () => client.invalidateQueries({ queryKey: ["notifications"] }) });
  const items = notifications.data?.notifications ?? [];
  const unread = items.filter((item) => !item.read).length;
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
        <div className="relative">
          <Button variant="outline" size="sm" className="size-9 p-0" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} onClick={() => setOpen(!open)}>
            <Bell size={16} />
            {unread > 0 && <span className="notification-count">{unread > 9 ? "9+" : unread}</span>}
          </Button>
          {open && <div className="notification-popover"> <div className="notification-heading"><strong>Notifications</strong><span>{unread} unread</span></div>{items.length ? items.slice(0, 6).map((item) => <button className={`notification-item ${item.read ? "notification-read" : ""}`} key={item.id} onClick={() => !item.read && markRead.mutate(item.id)}><strong>{item.title}</strong><span>{item.message}</span><small>{new Date(item.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</small></button>) : <p className="notification-empty">No notifications yet.</p>}</div>}
        </div>
        <Button variant="outline" size="sm" onClick={onLogout}>
          <LogOut size={15} />
          <span className="hidden sm:inline">Sign out</span>
        </Button>
      </div>
    </header>
  );
}
