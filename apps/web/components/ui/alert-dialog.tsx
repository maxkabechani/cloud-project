"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type AlertDialogContextValue = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  titleId: string;
  descriptionId: string;
};

const AlertDialogContext = React.createContext<AlertDialogContextValue | null>(null);

function useAlertDialog() {
  const context = React.useContext(AlertDialogContext);
  if (!context) throw new Error("AlertDialog components must be used inside AlertDialog");
  return context;
}

function AlertDialog({
  open = false,
  onOpenChange,
  children,
}: {
  open?: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const titleId = React.useId();
  const descriptionId = React.useId();
  return (
    <AlertDialogContext.Provider value={{ open, onOpenChange, titleId, descriptionId }}>
      {children}
    </AlertDialogContext.Provider>
  );
}

function AlertDialogContent({ className, children, ...props }: React.ComponentProps<"div">) {
  const { open, onOpenChange, titleId, descriptionId } = useAlertDialog();
  const contentRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const previousActive = document.activeElement as HTMLElement | null;
    contentRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onOpenChange(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousActive?.focus();
    };
  }, [open, onOpenChange]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="presentation">
        <button
          type="button"
          aria-label="Close dialog"
          className="absolute inset-0 bg-transparent backdrop-blur-[3px]"
          onClick={() => onOpenChange(false)}
        />
        <div
          ref={contentRef}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          tabIndex={-1}
          className={cn(
            "relative max-h-[calc(100svh-2rem)] w-full max-w-md overflow-y-auto whitespace-normal break-words rounded-2xl border border-slate-200 bg-white p-6 text-slate-950 shadow-2xl outline-none",
            className,
          )}
          {...props}
        >
          {children}
        </div>
      </div>,
    document.body,
  );
}

function AlertDialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("grid gap-2", className)} {...props} />;
}

function AlertDialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)} {...props} />;
}

function AlertDialogTitle({ className, ...props }: React.ComponentProps<"h2">) {
  const { titleId } = useAlertDialog();
  return <h2 id={titleId} className={cn("text-lg font-semibold tracking-tight", className)} {...props} />;
}

function AlertDialogDescription({ className, ...props }: React.ComponentProps<"p">) {
  const { descriptionId } = useAlertDialog();
  return <p id={descriptionId} className={cn("whitespace-normal break-words text-sm leading-6 text-slate-600 [overflow-wrap:anywhere]", className)} {...props} />;
}

function AlertDialogCancel({ className, ...props }: React.ComponentProps<typeof Button>) {
  const { onOpenChange } = useAlertDialog();
  return (
    <Button type="button" variant="outline" className={className} onClick={() => onOpenChange(false)} {...props}>
      Cancel
    </Button>
  );
}

function AlertDialogAction({ className, ...props }: React.ComponentProps<typeof Button>) {
  return <Button type="button" className={className} {...props} />;
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
};
