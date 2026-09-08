import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export type DashboardMetric = {
  label: string;
  value: string;
  detail: string;
  icon: ReactNode;
  tone: "teal" | "blue" | "violet" | "amber";
  trend?: "up" | "down";
};

const toneClasses = {
  teal: "bg-cyan-50 text-cyan-800",
  blue: "bg-cyan-50 text-cyan-800",
  violet: "bg-cyan-50 text-cyan-800",
  amber: "bg-cyan-50 text-cyan-800",
};

export function SectionCards({ metrics }: { metrics: DashboardMetric[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => (
        <Card key={metric.label} className="shadow-none">
          <CardContent className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 p-5">
            <div className={`row-span-3 grid size-10 place-items-center rounded-lg ${toneClasses[metric.tone]}`}>
              {metric.icon}
            </div>
            <p className="text-xs font-medium text-slate-500">{metric.label}</p>
            <p className="text-2xl font-semibold tracking-tight text-slate-950">{metric.value}</p>
            <p className="flex items-center gap-1 text-xs text-slate-500">
              {metric.trend === "up" ? <ArrowUpRight size={13} className="text-cyan-700" /> : metric.trend === "down" ? <ArrowDownRight size={13} className="text-cyan-700" /> : null}
              {metric.detail}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
