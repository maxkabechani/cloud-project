import * as React from "react";
import { cn } from "@/lib/utils";
export function Input({
  className,
  type,
  ...props
}: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(
        "h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 outline-none transition focus:border-cyan-700 focus:ring-3 focus:ring-cyan-700/15 disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
