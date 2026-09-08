import { DashboardShell } from "@/components/dashboard-shell";

export default async function NodeDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DashboardShell section="node-detail" detailId={id} />;
}
