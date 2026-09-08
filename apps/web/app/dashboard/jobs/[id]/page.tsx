import { DashboardShell } from "@/components/dashboard-shell";

export default async function JobDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DashboardShell section="job-detail" detailId={id} />;
}
