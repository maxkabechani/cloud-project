import { DashboardShell } from "@/components/dashboard-shell";

export default async function BenchmarkDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DashboardShell section="benchmark-detail" detailId={id} />;
}
