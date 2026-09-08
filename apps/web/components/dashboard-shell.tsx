"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ArrowLeft,
  AlertTriangle,
  Boxes,
  ChartLine,
  Cloud,
  Cpu,
  Gauge,
  HardDrive,
  LayoutDashboard,
  Layers3,
  LockKeyhole,
  MemoryStick,
  Play,
  Plus,
  Server,
  Settings,
  ShieldCheck,
  Square,
  TerminalSquare,
  Trash2,
  Users,
  RefreshCw,
  XCircle,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { type ActivityLog, type Benchmark, type CloudAccount, type ClusterNode, type CurrentUser, type MpiJob, type VirtualMachine } from "@hpc/shared";
import { API_URL, authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dashboard01 } from "@/components/dashboard-01";
import { SectionCards } from "@/components/section-cards";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Section = "overview" | "vms" | "members" | "nodes" | "accounts" | "activity" | "jobs" | "benchmarks" | "settings" | "job-new" | "job-detail" | "node-detail" | "benchmark-detail";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(API_URL + path, { ...init, credentials: "include", headers, cache: "no-store" });
  const body = (await response.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!response.ok) { const error = new Error(body.error?.message ?? "The request could not be completed."); Object.assign(error, { status: response.status }); throw error; }
  return body;
}

const nav: Array<{ section: Section; label: string; icon: typeof LayoutDashboard }> = [
  { section: "overview", label: "Overview", icon: LayoutDashboard },
  { section: "vms", label: "Virtual machines", icon: Boxes },
  { section: "members", label: "Members", icon: Users },
  { section: "nodes", label: "Cluster nodes", icon: Server },
  { section: "accounts", label: "Cloud accounts", icon: Cloud },
  { section: "activity", label: "Activity", icon: Activity },
  { section: "jobs", label: "MPI jobs", icon: TerminalSquare },
  { section: "benchmarks", label: "Benchmarks", icon: ChartLine },
  { section: "settings", label: "Settings", icon: Settings },
];

function StatusDot({ status }: { status: string }) { return <span className={`status-dot status-${status}`} aria-label={status} />; }
function StatusBadge({ status }: { status: string }) { return <span className={`status-badge status-${status}`}><StatusDot status={status} />{status.replaceAll("_", " ")}</span>; }
function PageTitle({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) { return <div className="page-title"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p className="muted">{description}</p></div>{action}</div>; }
function LoadingCard() { return <div className="loading-card" role="status">Loading workspace data…</div>; }
function ErrorCard({ message }: { message: string }) { return <div className="error-box" role="alert">{message}</div>; }

export function DashboardShell({ section, detailId }: { section: Section; detailId?: string }) {
  const router = useRouter();
  const client = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<{ user: CurrentUser }>("/api/me"), retry: false });
  const user = me.data?.user;
  useEffect(() => { if (me.error && (me.error as Error & { status?: number }).status === 401) router.replace("/login"); }, [me.error, router]);

  async function logout() { await authClient.signOut(); client.clear(); router.replace("/login"); router.refresh(); }
  if (me.isPending) return <main className="state-screen" role="status"><Layers3 size={36} /><p>Opening your workspace…</p></main>;
  if (me.isError || !user) return <main className="state-screen"><XCircle size={36} /><h1>Account service unavailable</h1><p>Sign in again to reopen your workspace.</p><Button onClick={() => router.replace("/login")}>Return to sign in</Button></main>;
  const activeSection = section === "job-new" || section === "job-detail" ? "jobs" : section === "node-detail" ? "nodes" : section === "benchmark-detail" ? "benchmarks" : section;
  return <Dashboard01 nav={nav} section={activeSection} sectionLabel={nav.find((item) => item.section === section)?.label ?? (section === "job-new" || section === "job-detail" ? "MPI jobs" : section === "node-detail" ? "Cluster nodes" : section === "benchmark-detail" ? "Benchmarks" : "Overview")} user={user} onLogout={logout}><div className="workspace-content"><SectionView section={section} detailId={detailId} user={user} onToast={(message) => toast.success(message)} /></div></Dashboard01>;
}

function SectionView({ section, detailId, user, onToast }: { section: Section; detailId?: string; user: CurrentUser; onToast: (message: string) => void }) {
  if (section === "vms") return <VmsPage user={user} onToast={onToast} />;
  if (section === "members") return <MembersPage user={user} />;
  if (section === "nodes") return <NodesPage />;
  if (section === "accounts") return <AccountsPage user={user} onToast={onToast} />;
  if (section === "activity") return <ActivityPage />;
  if (section === "jobs") return <EnhancedJobsPage onToast={onToast} />;
  if (section === "job-new") return <JobNewPage onToast={onToast} />;
  if (section === "job-detail" && detailId) return <JobDetailPage id={detailId} />;
  if (section === "benchmarks") return <BenchmarksPage onToast={onToast} />;
  if (section === "benchmark-detail" && detailId) return <BenchmarkDetailPage id={detailId} />;
  if (section === "node-detail" && detailId) return <NodeDetailPage id={detailId} />;
  if (section === "settings") return <SettingsPage user={user} />;
  return <OverviewPage user={user} onToast={onToast} />;
}

function OverviewPage({ user, onToast }: { user: CurrentUser; onToast: (message: string) => void }) {
  const query = useQuery({ queryKey: ["dashboard"], queryFn: () => api<{ status: { status: string; provider: string }; metrics: { nodesOnline: number; nodeCount: number; runningVms: number; runningJobs: number; totalUsers: number; cpuUsage: number; ramUsage: number }; nodes: ClusterNode[]; vms: VirtualMachine[]; benchmarks: Benchmark[]; activity: ActivityLog[] }>("/api/dashboard"), refetchInterval: 10000 });
  if (query.isPending) return <LoadingCard />; if (query.isError) return <ErrorCard message="The cluster overview could not be loaded." />;
  if (!query.data?.metrics || !query.data.status) return <ErrorCard message="The cluster overview could not be loaded." />;
  const { metrics, status, nodes = [], vms = [], benchmarks = [], activity = [] } = query.data;
  return <><PageTitle eyebrow="COMMAND CENTER" title={`Good morning, ${user.name.split(" ")[0]}.`} description="A live view of your university computing workspace." /><section className="overview-hero"><div><span className="eyebrow">CLUSTER STATUS</span><div className="hero-status"><StatusDot status={status.status} /><strong>{status.status === "online" ? "Online" : "Offline"}</strong><span>•</span><span>Cluster provider</span></div><p>Your workspace is ready for compute and cluster monitoring.</p></div><div className="hero-spark"><Zap size={18} /><span>Polling every 10s</span></div></section><SectionCards metrics={[{ icon: <Server />, label: "Nodes online", value: `${metrics.nodesOnline}/${metrics.nodeCount}`, detail: "Cluster capacity", tone: "teal", trend: "up" }, { icon: <Boxes />, label: "Running VMs", value: String(metrics.runningVms), detail: `${metrics.runningJobs ?? 0} MPI jobs active`, tone: "blue", trend: "up" }, { icon: <Users />, label: "Members", value: String(metrics.totalUsers), detail: "Registered accounts", tone: "violet" }, { icon: <Gauge />, label: "Average CPU", value: `${metrics.cpuUsage}%`, detail: `${metrics.ramUsage}% memory used`, tone: "amber" }]} /><div className="content-grid"><section className="panel panel-wide"><div className="panel-heading"><div><span className="eyebrow">RECENT VIRTUAL MACHINES</span><h2>Your compute</h2></div><Link className="text-link" href="/dashboard/vms">View all <span>→</span></Link></div>{vms.length === 0 ? <Empty icon={<Boxes />} title="No virtual machines yet" description="Create your first VM to start using your cloud workspace." action={<Link href="/dashboard/vms"><Button><Plus size={16} />Create VM</Button></Link>} /> : <VmTable vms={vms} compact onToast={onToast} />}</section><section className="panel"><div className="panel-heading"><div><span className="eyebrow">CLUSTER NODES</span><h2>Capacity</h2></div><Link className="text-link" href="/dashboard/nodes">Details <span>→</span></Link></div><div className="node-mini-list">{nodes.map(node => <div className="node-mini" key={node.id}><div><StatusDot status={node.status} /><strong>{node.hostname}</strong></div><span>{node.cpuUsage}% CPU</span></div>)}</div></section><section className="panel"><div className="panel-heading"><div><span className="eyebrow">ACTIVE WORKLOADS</span><h2>Compute in use</h2></div><Link className="text-link" href="/dashboard/jobs">MPI jobs <span>→</span></Link></div><div className="node-mini-list"><div className="node-mini"><strong>Virtual machines</strong><span>{metrics.runningVms} running</span></div><div className="node-mini"><strong>MPI jobs</strong><span>{metrics.runningJobs ?? 0} running</span></div><div className="node-mini"><strong>Average RAM</strong><span>{metrics.ramUsage}% used</span></div></div></section><section className="panel"><div className="panel-heading"><div><span className="eyebrow">CLUSTER PERFORMANCE</span><h2>Recent benchmarks</h2></div><Link className="text-link" href="/dashboard/benchmarks">View all <span>→</span></Link></div>{benchmarks.length ? <div className="job-list">{benchmarks.slice(0, 3).map((benchmark) => <Link className="job-row job-row-link" href={`/dashboard/benchmarks/${benchmark.id}`} key={benchmark.id}><div className="job-mark"><ChartLine size={15} /></div><div><strong>{benchmark.program}</strong><small>{benchmark.runs.length} process configurations</small></div><StatusBadge status={benchmark.status} /></Link>)}</div> : <Empty icon={<ChartLine />} title="No benchmark history" description="Run a benchmark to compare parallel performance." />}</section><section className="panel panel-wide"><div className="panel-heading"><div><span className="eyebrow">AUDIT TRAIL</span><h2>Recent activity</h2></div><Link className="text-link" href="/dashboard/activity">View all <span>→</span></Link></div><ActivityList items={activity} /></section></div></>;
}

function Empty({ icon, title, description, action }: { icon: React.ReactNode; title: string; description: string; action?: React.ReactNode }) { return <div className="empty-state"><div className="empty-icon">{icon}</div><h3>{title}</h3><p>{description}</p>{action}</div>; }

function VmsPage({ user, onToast }: { user: CurrentUser; onToast: (message: string) => void }) {
  const client = useQueryClient(); const [showForm, setShowForm] = useState(false); const [form, setForm] = useState({ name: "", image: "Ubuntu 24.04 LTS", cpu: "2", memoryMb: "2048", diskGb: "10", placement: "automatic", nodeId: "" });
  const query = useQuery({ queryKey: ["vms"], queryFn: () => api<{ vms: VirtualMachine[] }>("/api/vms"), refetchInterval: 7000 });
  const nodes = useQuery({ queryKey: ["nodes"], queryFn: () => api<{ nodes: ClusterNode[] }>("/api/nodes"), refetchInterval: 10000 });
  const create = useMutation({ mutationFn: () => api<VirtualMachine>("/api/vms", { method: "POST", body: JSON.stringify({ ...form, cpu: Number(form.cpu), memoryMb: Number(form.memoryMb), diskGb: Number(form.diskGb) }) }), onSuccess: (vm) => { client.invalidateQueries({ queryKey: ["vms"] }); client.invalidateQueries({ queryKey: ["nodes"] }); setShowForm(false); setForm({ name: "", image: "Ubuntu 24.04 LTS", cpu: "2", memoryMb: "2048", diskGb: "10", placement: "automatic", nodeId: "" }); onToast(`${vm.name} created on ${vm.host ?? "the provider scheduler"}.`); } });
  if (query.isPending) return <LoadingCard />; if (query.isError) return <ErrorCard message="Virtual machines could not be loaded." />;
  return <><PageTitle eyebrow="COMPUTE" title="Virtual machines" description={user.role === "admin" ? "Manage every VM in the workspace." : "Create and manage your own research environments."} action={<Button onClick={() => setShowForm(!showForm)}><Plus size={16} />New VM</Button>} />{showForm && <form className="create-panel" onSubmit={event => { event.preventDefault(); create.mutate(); }}><div className="form-heading"><div><span className="eyebrow">NEW INSTANCE</span><h2>Configure a virtual machine</h2></div><button type="button" className="icon-button" onClick={() => setShowForm(false)} aria-label="Close"><XCircle size={19} /></button></div><div className="form-grid"><label>VM name<Input required value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="e.g. mpi-worker" /></label><label>Image<select value={form.image} onChange={event => setForm({ ...form, image: event.target.value })}><option>Ubuntu 24.04 LTS</option><option>Rocky Linux 9</option><option>Debian 12</option></select></label><label>CPU cores<select value={form.cpu} onChange={event => setForm({ ...form, cpu: event.target.value })}><option value="1">1 core</option><option value="2">2 cores</option><option value="4">4 cores</option></select></label><label>Memory<select value={form.memoryMb} onChange={event => setForm({ ...form, memoryMb: event.target.value })}><option value="512">512 MB</option><option value="1024">1 GB</option><option value="2048">2 GB</option><option value="4096">4 GB</option></select></label><label>Disk<select value={form.diskGb} onChange={event => setForm({ ...form, diskGb: event.target.value })}><option value="5">5 GB</option><option value="10">10 GB</option><option value="20">20 GB</option></select></label><label>Host placement<select value={form.placement} onChange={event => setForm({ ...form, placement: event.target.value })}><option value="automatic">Automatic (recommended)</option><option value="manual">Manual</option></select></label>{form.placement === "manual" && <label>Node<select required value={form.nodeId} onChange={event => setForm({ ...form, nodeId: event.target.value })}><option value="">Choose an online node</option>{nodes.data?.nodes.filter((node) => node.status === "online").map((node) => <option value={node.id} key={node.id}>{node.hostname} · {node.cpuUsage}% CPU · {node.ramUsage}% RAM</option>)}</select></label>}</div>{form.placement === "automatic" && <p className="placement-note">The backend will recommend the least-loaded suitable online node using CPU, RAM, and running VM count.</p>}{create.error && <ErrorCard message={(create.error as Error).message} />}<div className="form-actions"><Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button><Button disabled={create.isPending} type="submit">{create.isPending ? "Creating…" : "Create VM"}</Button></div></form>}<section className="panel"><div className="panel-heading"><div><span className="eyebrow">INVENTORY</span><h2>{query.data.vms.length} virtual machines</h2></div><span className="subtle-label"><StatusDot status="online" />Connected provider</span></div>{query.data.vms.length ? <VmTable vms={query.data.vms} onToast={onToast} /> : <Empty icon={<Boxes />} title="No virtual machines" description="Your first research environment is one click away." action={<Button onClick={() => setShowForm(true)}><Plus size={16} />Create VM</Button>} />}</section></>;
}

function DeleteVmButton({ vm, onDelete }: { vm: VirtualMachine; onDelete: () => void }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button className="danger-action" onClick={() => setOpen(true)} aria-label={`Delete ${vm.name}`}>
        <Trash2 size={15} />
      </button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="mb-1 grid size-10 place-items-center rounded-full bg-rose-100 text-rose-700">
              <AlertTriangle size={19} />
            </div>
            <AlertDialogTitle>Delete {vm.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the virtual machine and its workspace record. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel />
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700 focus-visible:ring-rose-600"
              onClick={() => {
                onDelete();
                setOpen(false);
              }}
            >
              Delete VM
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function VmTable({ vms, compact = false, onToast }: { vms: VirtualMachine[]; compact?: boolean; onToast: (message: string) => void }) { const client = useQueryClient(); const action = useMutation({ mutationFn: async ({ id, verb }: { id: string; verb: string }) => { if (verb === "delete") return api<void>(`/api/vms/${id}`, { method: "DELETE" }); return api<VirtualMachine>(`/api/vms/${id}/${verb}`, { method: "POST" }); }, onSuccess: (_data, variables) => { client.invalidateQueries({ queryKey: ["vms"] }); client.invalidateQueries({ queryKey: ["dashboard"] }); const labels: Record<string, string> = { start: "started", stop: "stopped", reboot: "rebooted" }; onToast(variables.verb === "delete" ? "Virtual machine deleted." : `Virtual machine ${labels[variables.verb] ?? variables.verb}.`); }, onError: (error) => toast.error(error instanceof Error ? error.message : "The virtual machine action failed.") }); return <div className="table-wrap"><table><thead><tr><th>Name</th><th>Status</th>{!compact && <><th>Owner</th><th>Resources</th><th>Host</th></>}<th aria-label="Actions" /></tr></thead><tbody>{vms.map(vm => <tr key={vm.id}><td><div className="table-primary"><span className="vm-mark"><Boxes size={15} /></span><div><strong>{vm.name}</strong><small>{vm.image}</small></div></div></td><td><StatusBadge status={vm.status} /></td>{!compact && <><td>{vm.ownerName}</td><td>{vm.cpu} vCPU · {vm.memoryMb >= 1024 ? `${vm.memoryMb / 1024} GB` : `${vm.memoryMb} MB`} · {vm.diskGb} GB</td><td>{vm.host ?? "—"}</td></>}<td><div className="row-actions">{vm.status === "running" ? <button onClick={() => action.mutate({ id: vm.id, verb: "stop" })} aria-label={`Stop ${vm.name}`}><Square size={15} /></button> : vm.status === "stopped" ? <button onClick={() => action.mutate({ id: vm.id, verb: "start" })} aria-label={`Start ${vm.name}`}><Play size={15} /></button> : null}<button onClick={() => action.mutate({ id: vm.id, verb: "reboot" })} aria-label={`Reboot ${vm.name}`}><Zap size={15} /></button><DeleteVmButton vm={vm} onDelete={() => action.mutate({ id: vm.id, verb: "delete" })} /></div></td></tr>)}</tbody></table></div>; }

function MembersPage({ user }: { user: CurrentUser }) { const query = useQuery({ queryKey: ["users"], queryFn: () => api<{ users: Array<CurrentUser & { cloudAccountStatus: string }> }>("/api/users") }); if (query.isPending) return <LoadingCard />; if (query.isError) return <ErrorCard message="Member directory could not be loaded." />; return <><PageTitle eyebrow="COMMUNITY" title="Members" description="People with access to the university computing workspace." /><section className="panel"><div className="panel-heading"><div><span className="eyebrow">DIRECTORY</span><h2>{query.data.users.length} registered members</h2></div><span className="subtle-label"><Users size={15} />Shared workspace</span></div><div className="member-grid">{query.data.users.map(member => <article className="member-card" key={member.id}><div className="avatar">{member.name.slice(0, 1).toUpperCase()}</div><div><h3>{member.name}{member.id === user.id && <span className="you-label">You</span>}</h3><p>{member.email}</p><div className="member-meta"><StatusDot status="online" />Active <span>·</span><span className="role-badge">{member.role}</span></div><div className="member-account"><StatusDot status={member.cloudAccountStatus === "active" ? "online" : "pending"} />Cloud account: {member.cloudAccountStatus.replaceAll("_", " ")} · Joined {new Date(member.createdAt).toLocaleDateString()}</div></div></article>)}</div></section></>; }

function NodesPage() { const query = useQuery({ queryKey: ["nodes"], queryFn: () => api<{ nodes: ClusterNode[] }>("/api/nodes"), refetchInterval: 10000 }); if (query.isPending) return <LoadingCard />; if (query.isError) return <ErrorCard message="Cluster nodes could not be loaded." />; return <><PageTitle eyebrow="INFRASTRUCTURE" title="Cluster nodes" description="Health and capacity across the Beowulf cluster." /><div className="node-grid">{query.data.nodes.map(node => <Link href={`/dashboard/nodes/${node.id}`} className="node-card node-card-link" key={node.id}><div className="node-card-head"><div><StatusBadge status={node.status} /><h2>{node.hostname}</h2><p>{node.ipAddress}</p></div><Server size={24} /></div><div className="node-metrics"><Meter icon={<Cpu size={15} />} label="CPU" value={node.cpuUsage} /><Meter icon={<MemoryStick size={15} />} label="RAM" value={node.ramUsage} /><Meter icon={<Gauge size={15} />} label="Disk" value={node.diskUsage} /></div><dl className="node-specs"><div><dt>Compute</dt><dd>{node.cpuCores} cores</dd></div><div><dt>RAM</dt><dd>{(node.usedMemoryMb / 1024).toFixed(1)} / {(node.memoryMb / 1024).toFixed(0)} GB</dd></div><div><dt>VMs</dt><dd>{node.runningVmCount}</dd></div><div><dt>Uptime</dt><dd>{node.status === "offline" ? `Last seen ${new Date(node.lastSeen).toLocaleTimeString()}` : node.uptime}</dd></div></dl></Link>)}</div></>; }
function Meter({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) { return <div className="meter"><div><span>{icon}{label}</span><strong>{value}%</strong></div><div className="meter-track"><span style={{ width: `${value}%` }} /></div></div>; }

function AccountsPage({ user, onToast }: { user: CurrentUser; onToast: (message: string) => void }) { const client = useQueryClient(); const query = useQuery({ queryKey: ["accounts"], queryFn: () => api<{ accounts: CloudAccount[] }>("/api/cloud-accounts") }); const provision = useMutation({ mutationFn: (userId?: string) => api<CloudAccount>("/api/cloud-accounts/provision", { method: "POST", body: JSON.stringify(userId ? { userId } : {}) }), onSuccess: () => { client.invalidateQueries({ queryKey: ["accounts"] }); onToast("Cloud account provisioned."); } }); if (query.isPending) return <LoadingCard />; if (query.isError) return <ErrorCard message="Cloud accounts could not be loaded." />; return <><PageTitle eyebrow="IDENTITY BRIDGE" title="Cloud accounts" description="Application identities mapped to provider accounts." /><section className="panel"><div className="panel-heading"><div><span className="eyebrow">PROVISIONING</span><h2>Provider access</h2></div><Cloud size={22} /></div><div className="account-list">{query.data.accounts.map(account => <div className="account-row" key={account.id}><div className="avatar avatar-small">{account.username?.slice(4, 5).toUpperCase() ?? "?"}</div><div className="account-info"><strong>{account.userId === user.id ? "Your cloud account" : `Member ${account.userId.slice(0, 8)}`}</strong><small>{account.username ?? "No provider username yet"}</small></div><StatusBadge status={account.status} /><div className="row-actions">{account.status === "not_provisioned" && <Button size="sm" onClick={() => provision.mutate(account.userId)} disabled={provision.isPending}>Provision</Button>}</div></div>)}</div></section></>; }

function ActivityPage() { const query = useQuery({ queryKey: ["activity"], queryFn: () => api<{ activity: ActivityLog[] }>("/api/activity") }); if (query.isPending) return <LoadingCard />; if (query.isError) return <ErrorCard message="Activity could not be loaded." />; return <><PageTitle eyebrow="AUDIT TRAIL" title="Activity" description="A record of important workspace operations." /><section className="panel"><ActivityList items={query.data.activity} expanded /></section></>; }
function ActivityList({ items, expanded = false }: { items: ActivityLog[]; expanded?: boolean }) { return items.length ? <div className="activity-list">{items.slice(0, expanded ? 100 : 6).map(item => <div className="activity-row" key={item.id}><div className="activity-icon"><Activity size={15} /></div><div><strong>{item.action}</strong><p>{item.userName} · {item.resourceType.replaceAll("_", " ")}</p></div><time>{new Date(item.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time></div>)}</div> : <Empty icon={<Activity />} title="No activity yet" description="Your workspace operations will appear here." />; }

function LegacyJobsPage({ onToast }: { onToast: (message: string) => void }) { const client = useQueryClient(); const [form, setForm] = useState({ name: "", program: "matrix-multiply", processCount: "4" }); const query = useQuery({ queryKey: ["legacy-jobs"], queryFn: () => api<{ jobs: MpiJob[] }>("/api/jobs"), refetchInterval: 2000 }); const create = useMutation({ mutationFn: () => api<MpiJob>("/api/jobs", { method: "POST", body: JSON.stringify({ ...form, processCount: Number(form.processCount) }) }), onSuccess: () => { client.invalidateQueries({ queryKey: ["legacy-jobs"] }); setForm({ name: "", program: "matrix-multiply", processCount: "4" }); onToast("MPI job queued."); } }); if (query.isPending) return <LoadingCard />; if (query.isError) return <ErrorCard message="MPI jobs could not be loaded." />; return <><PageTitle eyebrow="HIGH PERFORMANCE COMPUTING" title="MPI jobs" description="Run predefined MPI workloads through the controlled cluster interface." /><section className="job-layout"><form className="panel job-form" onSubmit={event => { event.preventDefault(); create.mutate(); }}><span className="eyebrow">SUBMIT WORKLOAD</span><h2>New MPI job</h2><p className="muted">Only approved programs can run through the cluster agent.</p><label>Job name<Input required value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="e.g. benchmark run" /></label><label>Program<select value={form.program} onChange={event => setForm({ ...form, program: event.target.value })}><option value="matrix-multiply">Matrix multiply</option><option value="calculate-pi">Calculate pi</option><option value="vector-addition">Vector addition</option></select></label><label>Processes<select value={form.processCount} onChange={event => setForm({ ...form, processCount: event.target.value })}><option value="2">2 processes</option><option value="4">4 processes</option><option value="8">8 processes</option><option value="16">16 processes</option></select></label>{create.error && <ErrorCard message={(create.error as Error).message} />}<Button type="submit" disabled={create.isPending}><Play size={15} />{create.isPending ? "Submitting…" : "Queue job"}</Button></form><section className="panel"><div className="panel-heading"><div><span className="eyebrow">QUEUE</span><h2>Recent jobs</h2></div><TerminalSquare size={22} /></div>{query.data.jobs.length ? <div className="job-list">{query.data.jobs.map(job => <div className="job-row" key={job.id}><div className="job-mark"><TerminalSquare size={15} /></div><div><strong>{job.name}</strong><small>{job.program} · {job.processCount} processes · {job.userName}</small></div><StatusBadge status={job.status} /></div>)}</div> : <Empty icon={<TerminalSquare />} title="No MPI jobs" description="Queue a predefined workload when you are ready." />}</section></section></>; }
void LegacyJobsPage;

function EnhancedJobsPage({ onToast }: { onToast: (message: string) => void }) {
  const client = useQueryClient();
  const [form, setForm] = useState({ name: "", program: "matrix-multiply", processCount: "4", nodeSelection: "automatic", nodes: [] as string[] });
  const jobs = useQuery({ queryKey: ["jobs"], queryFn: () => api<{ jobs: MpiJob[] }>("/api/jobs"), refetchInterval: 1500 });
  const nodes = useQuery({ queryKey: ["nodes"], queryFn: () => api<{ nodes: ClusterNode[] }>("/api/nodes"), refetchInterval: 10000 });
  const create = useMutation({ mutationFn: () => api<MpiJob>("/api/jobs", { method: "POST", body: JSON.stringify({ name: form.name, program: form.program, processCount: Number(form.processCount), nodeSelection: form.nodeSelection === "automatic" ? "automatic" : form.nodes }) }), onSuccess: () => { client.invalidateQueries({ queryKey: ["jobs"] }); setForm({ name: "", program: "matrix-multiply", processCount: "4", nodeSelection: "automatic", nodes: [] }); onToast("MPI job queued."); } });
  if (jobs.isPending || nodes.isPending) return <LoadingCard />;
  if (jobs.isError || nodes.isError) return <ErrorCard message="MPI workspace data could not be loaded." />;
  const onlineNodes = nodes.data.nodes.filter((node) => node.status === "online");
  return <><PageTitle eyebrow="HIGH PERFORMANCE COMPUTING" title="MPI jobs" description="Run approved parallel workloads through the controlled cluster interface." action={<Link href="/dashboard/jobs/new"><Button><Plus size={16} />New job</Button></Link>} /><section className="job-layout"><form className="panel job-form" onSubmit={(event) => { event.preventDefault(); create.mutate(); }}><span className="eyebrow">SUBMIT WORKLOAD</span><h2>Queue a parallel program</h2><p className="muted">Commands and executable paths are never accepted from the browser.</p><label>Job name<Input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. matrix study" /></label><label>Program<select value={form.program} onChange={(event) => setForm({ ...form, program: event.target.value })}><option value="matrix-multiply">Matrix multiplication</option><option value="calculate-pi">Calculate Pi</option><option value="vector-addition">Vector addition</option></select></label><label>Processes<select value={form.processCount} onChange={(event) => setForm({ ...form, processCount: event.target.value })}><option value="1">1 process</option><option value="2">2 processes</option><option value="4">4 processes</option><option value="8">8 processes</option></select></label><label>Nodes<select value={form.nodeSelection} onChange={(event) => setForm({ ...form, nodeSelection: event.target.value })}><option value="automatic">Automatic placement</option><option value="manual">Select online nodes</option></select></label>{form.nodeSelection === "manual" && <div className="choice-list">{onlineNodes.map((node) => <label key={node.id} className="choice-row"><input type="checkbox" checked={form.nodes.includes(node.hostname)} onChange={(event) => setForm({ ...form, nodes: event.target.checked ? [...form.nodes, node.hostname] : form.nodes.filter((item) => item !== node.hostname) })} />{node.hostname}<span className="muted">{node.cpuUsage}% CPU</span></label>)}</div>}{create.error && <ErrorCard message={(create.error as Error).message} />}<Button type="submit" disabled={create.isPending}><Play size={15} />{create.isPending ? "Submitting…" : "Queue job"}</Button></form><section className="panel"><div className="panel-heading"><div><span className="eyebrow">QUEUE</span><h2>Recent jobs</h2></div><TerminalSquare size={22} /></div>{jobs.data.jobs.length ? <div className="job-list">{jobs.data.jobs.map((job) => <Link className="job-row job-row-link" href={`/dashboard/jobs/${job.id}`} key={job.id}><div className="job-mark"><TerminalSquare size={15} /></div><div><strong>{job.name}</strong><small>{job.program} · {job.processCount} processes · {((job.nodesUsed ?? []).join(", ") || "pending placement")}</small></div><StatusBadge status={job.status} /></Link>)}</div> : <Empty icon={<TerminalSquare />} title="No MPI jobs" description="Queue a predefined workload when you are ready." />}</section></section></>;
}

function JobNewPage({ onToast }: { onToast: (message: string) => void }) { return <><PageTitle eyebrow="HIGH PERFORMANCE COMPUTING" title="New MPI job" description="Choose a trusted program and a validated process count." action={<Link href="/dashboard/jobs"><Button variant="outline"><ArrowLeft size={15} />Back to jobs</Button></Link>} /><EnhancedJobsPage onToast={onToast} /></>; }

function JobDetailPage({ id }: { id: string }) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["job", id], queryFn: () => api<MpiJob>(`/api/jobs/${id}`), refetchInterval: 1200 });
  const cancel = useMutation({ mutationFn: () => api<void>(`/api/jobs/${id}/cancel`, { method: "POST" }), onSuccess: () => { client.invalidateQueries({ queryKey: ["job", id] }); client.invalidateQueries({ queryKey: ["jobs"] }); } });
  if (query.isPending) return <LoadingCard />;
  if (query.isError) return <ErrorCard message="MPI job could not be loaded." />;
  const job = query.data;
  const nodesUsed = job.nodesUsed ?? [];
  return <><PageTitle eyebrow="MPI WORKLOAD" title={job.name} description={`${job.program} · submitted ${new Date(job.createdAt).toLocaleString()}`} action={<Link href="/dashboard/jobs"><Button variant="outline"><ArrowLeft size={15} />All jobs</Button></Link>} /><div className="detail-grid"><section className="panel"><div className="panel-heading"><div><span className="eyebrow">STATUS</span><h2>{job.program}</h2></div><StatusBadge status={job.status} /></div><dl className="detail-list"><div><dt>Processes</dt><dd>{job.processCount}</dd></div><div><dt>Nodes used</dt><dd>{nodesUsed.length ? nodesUsed.join(", ") : "Pending placement"}</dd></div><div><dt>Submitted</dt><dd>{new Date(job.createdAt).toLocaleString()}</dd></div><div><dt>Started</dt><dd>{job.startedAt ? new Date(job.startedAt).toLocaleString() : "—"}</dd></div><div><dt>Completed</dt><dd>{job.completedAt ? new Date(job.completedAt).toLocaleString() : "—"}</dd></div><div><dt>Execution duration</dt><dd>{job.executionTimeMs ? `${(job.executionTimeMs / 1000).toFixed(2)} seconds` : "—"}</dd></div></dl>{["queued", "starting", "running"].includes(job.status) && <Button variant="outline" onClick={() => cancel.mutate()} disabled={cancel.isPending}>Cancel job</Button>}</section><section className="panel"><span className="eyebrow">RESULT</span><h2>{job.status === "completed" ? "Completed successfully" : job.status === "failed" ? "Execution failed" : "Workload progress"}</h2><p className="result-copy">{job.output ?? job.error ?? "The cluster agent is preparing this workload."}</p><div className="progress-steps"><span className={job.status !== "queued" ? "step-done" : ""}>Queued</span><span className={["starting", "running", "completed"].includes(job.status) ? "step-done" : ""}>Starting</span><span className={["running", "completed"].includes(job.status) ? "step-done" : ""}>Running</span><span className={job.status === "completed" ? "step-done" : ""}>Completed</span></div></section></div></>;
}

function NodeDetailPage({ id }: { id: string }) {
  const query = useQuery({ queryKey: ["node", id], queryFn: () => api<{ node: ClusterNode; vms: VirtualMachine[]; activity: ActivityLog[] }>(`/api/nodes/${id}`), refetchInterval: 7000 });
  if (query.isPending) return <LoadingCard />;
  if (query.isError) return <ErrorCard message="Node details could not be loaded." />;
  const { node, vms, activity } = query.data;
  return <><PageTitle eyebrow="INFRASTRUCTURE" title={node.hostname} description={`${node.ipAddress} · last seen ${new Date(node.lastSeen).toLocaleTimeString()}`} action={<Link href="/dashboard/nodes"><Button variant="outline"><ArrowLeft size={15} />All nodes</Button></Link>} /><div className="detail-grid"><section className="panel"><div className="panel-heading"><div><span className="eyebrow">CURRENT STATUS</span><h2>Resource utilization</h2></div><StatusBadge status={node.status} /></div><div className="node-metrics"><Meter icon={<Cpu size={15} />} label="CPU" value={node.cpuUsage} /><Meter icon={<MemoryStick size={15} />} label="RAM" value={node.ramUsage} /><Meter icon={<HardDrive size={15} />} label="Disk" value={node.diskUsage} /></div><dl className="node-specs"><div><dt>Hardware</dt><dd>{node.cpuCores} cores</dd></div><div><dt>Memory</dt><dd>{(node.usedMemoryMb / 1024).toFixed(1)} / {(node.memoryMb / 1024).toFixed(0)} GB</dd></div><div><dt>Uptime</dt><dd>{node.uptime}</dd></div><div><dt>Running VMs</dt><dd>{node.runningVmCount}</dd></div></dl></section><section className="panel"><div className="panel-heading"><div><span className="eyebrow">WORKLOADS</span><h2>Running VMs</h2></div><Boxes size={22} /></div>{vms.length ? <div className="job-list">{vms.map((vm) => <div className="job-row" key={vm.id}><div className="vm-mark"><Boxes size={15} /></div><div><strong>{vm.name}</strong><small>{vm.cpu} vCPU · {vm.memoryMb / 1024} GB · {vm.status}</small></div><StatusBadge status={vm.status} /></div>)}</div> : <Empty icon={<Boxes />} title="No VMs on this node" description="Automatic placement will consider this node's available capacity." />}</section></div><section className="panel"><div className="panel-heading"><div><span className="eyebrow">RECENT ACTIVITY</span><h2>Node events</h2></div><Activity size={22} /></div><ActivityList items={activity} expanded /></section></>;
}

function BenchmarksPage({ onToast }: { onToast: (message: string) => void }) {
  const client = useQueryClient();
  const [program, setProgram] = useState("matrix-multiply");
  const [processCounts, setProcessCounts] = useState([1, 2, 4, 8]);
  const query = useQuery({ queryKey: ["benchmarks"], queryFn: () => api<{ benchmarks: Benchmark[] }>("/api/benchmarks") });
  const create = useMutation({ mutationFn: () => api<Benchmark>("/api/benchmarks", { method: "POST", body: JSON.stringify({ program, processCounts }) }), onSuccess: () => { client.invalidateQueries({ queryKey: ["benchmarks"] }); onToast("Benchmark completed."); } });
  if (query.isPending) return <LoadingCard />;
  if (query.isError) return <ErrorCard message="Benchmark history could not be loaded." />;
  return <><PageTitle eyebrow="PARALLEL PERFORMANCE" title="Benchmarks" description="Compare execution time and scaling across MPI process counts." /><section className="panel benchmark-launch"><div><span className="eyebrow">RUN BENCHMARK</span><h2>Choose a trusted workload</h2><p className="muted">Speedup compares each run with the single-process baseline; efficiency is speedup divided by process count.</p></div><div className="benchmark-controls"><label>Program<select value={program} onChange={(event) => setProgram(event.target.value)}><option value="matrix-multiply">Matrix multiplication</option><option value="calculate-pi">Calculate Pi</option><option value="vector-addition">Vector addition</option></select></label><div><span className="form-label">Test configurations</span><div className="process-pills">{[1, 2, 4, 8].map((count) => <label className={`process-pill ${processCounts.includes(count) ? "process-pill-active" : ""}`} key={count}><input type="checkbox" checked={processCounts.includes(count)} onChange={() => setProcessCounts(processCounts.includes(count) ? processCounts.filter((item) => item !== count) : [...processCounts, count].sort((a, b) => a - b))} />{count} process{count > 1 ? "es" : ""}</label>)}</div></div><Button onClick={() => create.mutate()} disabled={create.isPending || processCounts.length === 0}><ChartLine size={16} />{create.isPending ? "Running…" : "Run benchmark"}</Button></div></section><section className="panel"><div className="panel-heading"><div><span className="eyebrow">HISTORY</span><h2>Recent benchmarks</h2></div><RefreshCw size={20} /></div>{query.data.benchmarks.length ? <div className="job-list">{query.data.benchmarks.map((benchmark) => { const completed = benchmark.runs.filter((run) => run.status === "completed"); const best = completed.length ? Math.min(...completed.map((run) => run.executionTimeMs)) : null; const baseline = completed.find((run) => run.processCount === 1); const fastest = completed.length ? Math.max(...completed.map((run) => baseline ? baseline.executionTimeMs / run.executionTimeMs : 1)) : null; return <Link className="job-row job-row-link" href={`/dashboard/benchmarks/${benchmark.id}`} key={benchmark.id}><div className="job-mark"><ChartLine size={15} /></div><div><strong>{benchmark.program}</strong><small>{new Date(benchmark.createdAt).toLocaleDateString()} · {best ? `Best time ${(best / 1000).toFixed(2)}s` : "In progress"} · {fastest ? `Max speedup ${fastest.toFixed(2)}x` : ""}</small></div><StatusBadge status={benchmark.status} /></Link>; })}</div> : <Empty icon={<ChartLine />} title="No benchmarks yet" description="Run the same workload at several process counts to see parallel scaling." />}</section></>;
}

function BenchmarkDetailPage({ id }: { id: string }) {
  const query = useQuery({ queryKey: ["benchmark", id], queryFn: () => api<Benchmark>(`/api/benchmarks/${id}`), refetchInterval: 1500 });
  if (query.isPending) return <LoadingCard />;
  if (query.isError) return <ErrorCard message="Benchmark could not be loaded." />;
  const benchmark = query.data;
  const runs = [...benchmark.runs].sort((a, b) => a.processCount - b.processCount);
  const baseline = runs.find((run) => run.processCount === 1)?.executionTimeMs ?? runs[0]?.executionTimeMs ?? 1;
  const values = runs.map((run) => ({ ...run, seconds: run.executionTimeMs / 1000, speedup: baseline / run.executionTimeMs, efficiency: baseline / run.executionTimeMs / run.processCount }));
  return <><PageTitle eyebrow="BENCHMARK RESULTS" title={benchmark.program} description={`Completed ${benchmark.completedAt ? new Date(benchmark.completedAt).toLocaleString() : "in progress"}`} action={<Link href="/dashboard/benchmarks"><Button variant="outline"><ArrowLeft size={15} />History</Button></Link>} /><section className="benchmark-chart-grid"><ChartPanel title="Execution time vs process count" data={values} metric="seconds" color="#197f86" /><ChartPanel title="Speedup vs process count" data={values} metric="speedup" color="#b47a19" /></section><section className="panel"><div className="panel-heading"><div><span className="eyebrow">RESULTS</span><h2>Scaling table</h2></div><StatusBadge status={benchmark.status} /></div><div className="table-wrap"><table><thead><tr><th>Processes</th><th>Nodes</th><th>Time</th><th>Speedup</th><th>Efficiency</th></tr></thead><tbody>{values.map((run) => <tr key={run.id}><td>{run.processCount}</td><td>{run.nodeCount}</td><td>{run.seconds.toFixed(2)}s</td><td>{run.speedup.toFixed(2)}x</td><td>{(run.efficiency * 100).toFixed(1)}%</td></tr>)}</tbody></table></div><p className="muted benchmark-help">Speedup = single-process time ÷ parallel time. Efficiency = speedup ÷ process count. Efficiency decreases when communication and coordination overhead become significant.</p></section></>;
}

function ChartPanel({ title, data, metric, color }: { title: string; data: Array<{ processCount: number; seconds: number; speedup: number }>; metric: "seconds" | "speedup"; color: string }) { const max = Math.max(...data.map((item) => item[metric]), 1); return <section className="panel chart-panel"><div className="panel-heading"><div><span className="eyebrow">GRAPH</span><h2>{title}</h2></div><ChartLine size={20} /></div><div className="chart-bars" role="img" aria-label={title}>{data.map((item) => <div className="chart-column" key={item.processCount}><div className="chart-value" style={{ height: `${Math.max(8, item[metric] / max * 100)}%`, background: color }} title={`${item.processCount} processes: ${metric === "seconds" ? `${item.seconds.toFixed(2)} seconds` : `${item.speedup.toFixed(2)}x speedup`}`} /><span>{item.processCount}p</span></div>)}</div><div className="chart-axis"><span>Lower is better</span><span>{metric === "seconds" ? "seconds" : "speedup"}</span></div></section>; }

function SettingsPage({ user }: { user: CurrentUser }) {
  return (
    <>
      <PageTitle eyebrow="WORKSPACE" title="Settings" description="Manage your profile, password, and workspace connection." />
      <section className="settings-grid">
        <div className="panel">
          <span className="eyebrow">PROFILE</span>
          <h2>{user.name}</h2>
          <p className="muted">{user.email}</p>
          <dl className="settings-list">
            <div><dt>Role</dt><dd><span className="role-badge">{user.role}</span></dd></div>
            <div><dt>Member since</dt><dd>{new Date(user.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}</dd></div>
          </dl>
        </div>
        <div className="panel">
          <span className="eyebrow">ENVIRONMENT</span>
          <h2>Cloud workspace</h2>
          <p className="muted">Your connected university computing environment</p>
          <div className="environment-status"><StatusDot status="online" /><strong>Connected</strong><span>Workspace data and cluster services are available.</span></div>
          <div className="security-note"><ShieldCheck size={20} /><span>Infrastructure credentials are kept out of the browser and managed by the cluster service.</span></div>
        </div>
        <ChangePasswordForm />
      </section>
    </>
  );
}

function ChangePasswordForm() {
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [isPending, setIsPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (form.newPassword.length < 12) {
      toast.error("Choose a password with at least 12 characters.");
      return;
    }
    if (form.newPassword !== form.confirmPassword) {
      toast.error("The new passwords do not match.");
      return;
    }
    setIsPending(true);
    try {
      const response = await fetch(`${API_URL}/api/auth/change-password`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: form.currentPassword, newPassword: form.newPassword, revokeOtherSessions: true }),
      });
      const payload = (await response.json().catch(() => ({}))) as { message?: string; error?: { message?: string } };
      if (!response.ok) throw new Error(payload.message ?? payload.error?.message ?? "Password could not be updated.");
      setForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      toast.success("Password updated", { description: "Your password has been changed and other sessions were signed out." });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Password could not be updated.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <form className="panel password-panel" onSubmit={submit}>
      <div className="panel-heading">
        <div><span className="eyebrow">SECURITY</span><h2>Update password</h2><p className="muted">Use a password of 12–128 characters.</p></div>
        <LockKeyhole size={22} className="text-cyan-700" />
      </div>
      <div className="password-grid">
        <label>Current password<Input required type="password" autoComplete="current-password" value={form.currentPassword} onChange={(event) => setForm({ ...form, currentPassword: event.target.value })} /></label>
        <label>New password<Input required type="password" autoComplete="new-password" value={form.newPassword} onChange={(event) => setForm({ ...form, newPassword: event.target.value })} /></label>
        <label>Confirm new password<Input required type="password" autoComplete="new-password" value={form.confirmPassword} onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })} /></label>
      </div>
      <div className="form-actions"><Button type="submit" disabled={isPending}>{isPending ? "Updating…" : "Update password"}</Button></div>
    </form>
  );
}
