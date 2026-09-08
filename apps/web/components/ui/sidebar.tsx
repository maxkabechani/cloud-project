"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type SidebarContextValue = {
  open: boolean;
  toggle: () => void;
  mobileOpen: boolean;
  closeMobile: () => void;
};

const SidebarContext = React.createContext<SidebarContextValue | null>(null);

function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) throw new Error("useSidebar must be used inside SidebarProvider");
  return context;
}

function SidebarProvider({
  children,
  className,
  ...props
}: React.ComponentProps<"div">) {
  const [open, setOpen] = React.useState(true);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const toggle = React.useCallback(() => {
    if (isMobile) setMobileOpen((value) => !value);
    else setOpen((value) => !value);
  }, [isMobile]);
  const closeMobile = React.useCallback(() => setMobileOpen(false), []);
  return (
    <SidebarContext.Provider value={{ open, toggle, mobileOpen, closeMobile }}>
      <div
        data-slot="sidebar-wrapper"
        className={cn("flex min-h-svh w-full bg-slate-50", className)}
        {...props}
      >
        {mobileOpen && (
          <button
            type="button"
            aria-label="Close sidebar"
            className="fixed inset-0 z-30 bg-slate-950/20 md:hidden"
            onClick={closeMobile}
          />
        )}
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

function Sidebar({ className, children, ...props }: React.ComponentProps<"aside">) {
  const { open, mobileOpen } = useSidebar();
  return (
    <aside
      data-slot="sidebar"
      data-state={open ? "expanded" : "collapsed"}
      className={cn(
        "fixed inset-y-0 left-0 z-40 flex h-dvh max-h-dvh w-64 shrink-0 flex-col border-r border-slate-200 bg-white shadow-xl transition-transform duration-200 md:shadow-none md:transition-[width]",
        mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        open ? "md:w-64" : "md:w-16",
        className,
      )}
      {...props}
    >
      {children}
    </aside>
  );
}

function SidebarInset({ className, ...props }: React.ComponentProps<"main">) {
  return (
    <main
      data-slot="sidebar-inset"
      className={cn("min-w-0 flex-1 md:ml-64", className)}
      {...props}
    />
  );
}

function SidebarHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sidebar-header" className={cn("p-4", className)} {...props} />;
}

function SidebarContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-content"
      className={cn("flex min-h-0 flex-1 flex-col gap-2 overflow-auto px-3", className)}
      {...props}
    />
  );
}

function SidebarFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sidebar-footer" className={cn("border-t border-slate-200 p-3", className)} {...props} />;
}

function SidebarMenu({ className, ...props }: React.ComponentProps<"ul">) {
  return <ul data-slot="sidebar-menu" className={cn("flex w-full min-w-0 flex-col gap-1", className)} {...props} />;
}

function SidebarMenuItem({ className, ...props }: React.ComponentProps<"li">) {
  return <li data-slot="sidebar-menu-item" className={cn("group/menu-item relative", className)} {...props} />;
}

function SidebarMenuButton({
  asChild = false,
  isActive = false,
  className,
  children,
  ...props
}: React.ComponentProps<"button"> & {
  asChild?: boolean;
  isActive?: boolean;
}) {
  const { open } = useSidebar();
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot="sidebar-menu-button"
      data-active={isActive}
      className={cn(
        "flex h-9 w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-700",
        isActive && "bg-cyan-50 font-semibold text-cyan-900 hover:bg-cyan-100",
        !open && "justify-center px-0",
        className,
      )}
      title={!open && typeof children === "string" ? children : undefined}
      {...props}
    >
      {children}
    </Comp>
  );
}

function SidebarTrigger({ className, ...props }: React.ComponentProps<typeof Button>) {
  const { toggle } = useSidebar();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-label="Toggle sidebar"
      className={cn("h-9 w-9 px-0 md:hidden", className)}
      onClick={toggle}
      {...props}
    >
      <Menu size={17} />
    </Button>
  );
}

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
};
