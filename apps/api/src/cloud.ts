import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  vmCreateSchema,
  type ActivityLog,
  type CloudAccount,
  type CloudUser,
  type ClusterNode,
  type CurrentUser,
  type MpiJob,
  type Benchmark,
  type BenchmarkRun,
  type Notification,
  type VirtualMachine,
  benchmarkCreateSchema,
  submitMpiJobSchema,
} from "@hpc/shared";
import { ClusterMPIProvider, MockMPIProvider, type MPIProvider } from "./mpi";

export interface CloudProvider {
  getStatus(): Promise<{ status: "online" | "offline"; provider: string; lastSuccessfulConnection: string | null }>;
  listUsers(): Promise<CloudUser[]>;
  createUser(input: { username: string; name: string }): Promise<CloudUser>;
  listVMs(): Promise<VirtualMachine[]>;
  getVM(id: string): Promise<VirtualMachine | undefined>;
  createVM(input: { ownerId: string; ownerName: string; name: string; image: string; cpu: number; memoryMb: number; diskGb: number; placement?: "automatic" | "manual"; nodeId?: string }): Promise<VirtualMachine>;
  startVM(id: string): Promise<VirtualMachine>;
  stopVM(id: string): Promise<VirtualMachine>;
  rebootVM(id: string): Promise<VirtualMachine>;
  deleteVM(id: string): Promise<void>;
  listNodes(): Promise<ClusterNode[]>;
}

type PersistedState = {
  vms: VirtualMachine[];
  cloudUsers?: CloudUser[];
  accounts: CloudAccount[];
  activity: ActivityLog[];
  jobs: MpiJob[];
};
type ServiceState = { activity: ActivityLog[]; benchmarks: Benchmark[]; notifications: Notification[] };

const now = () => new Date().toISOString();
const stateFile = resolve(process.cwd(), ".local/cloud-state.json");
const serviceStateFile = resolve(process.cwd(), ".local/service-state.json");

export class MockCloudProvider implements CloudProvider {
  private vms = new Map<string, VirtualMachine>();
  private cloudUsers = new Map<string, CloudUser>();
  private nodes: ClusterNode[] = [
    { id: "master", hostname: "master", ipAddress: "10.0.0.10", status: "online", cpuUsage: 42, ramUsage: 58, diskUsage: 37, cpuCores: 16, memoryMb: 32768, usedMemoryMb: 19005, runningVmCount: 1, uptime: "18d 04h", lastSeen: now() },
    { id: "node01", hostname: "node01", ipAddress: "10.0.0.11", status: "online", cpuUsage: 68, ramUsage: 54, diskUsage: 41, cpuCores: 32, memoryMb: 65536, usedMemoryMb: 35389, runningVmCount: 2, uptime: "18d 04h", lastSeen: now() },
    { id: "node02", hostname: "node02", ipAddress: "10.0.0.12", status: "online", cpuUsage: 51, ramUsage: 47, diskUsage: 39, cpuCores: 32, memoryMb: 65536, usedMemoryMb: 30802, runningVmCount: 1, uptime: "18d 04h", lastSeen: now() },
    { id: "node03", hostname: "node03", ipAddress: "10.0.0.13", status: "online", cpuUsage: 29, ramUsage: 34, diskUsage: 45, cpuCores: 32, memoryMb: 65536, usedMemoryMb: 22282, runningVmCount: 0, uptime: "18d 04h", lastSeen: now() },
  ];
  private loaded = false;

  async load() {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const state = JSON.parse(await readFile(stateFile, "utf8")) as PersistedState;
      for (const vm of state.vms ?? []) this.vms.set(vm.id, vm);
      for (const user of state.cloudUsers ?? []) this.cloudUsers.set(user.id, user);
    } catch {
      // A missing local state file is the expected first-run path.
    }
  }

  private async persist() {
    await mkdir(dirname(stateFile), { recursive: true });
    const state: PersistedState = { vms: [...this.vms.values()], cloudUsers: [...this.cloudUsers.values()], accounts: [], activity: [], jobs: [] };
    try {
      const old = JSON.parse(await readFile(stateFile, "utf8")) as PersistedState;
      state.accounts = old.accounts ?? [];
      state.activity = old.activity ?? [];
      state.jobs = old.jobs ?? [];
    } catch {
      // Keep empty collections on first write.
    }
    await writeFile(stateFile, JSON.stringify(state, null, 2), { mode: 0o600 });
  }

  async getStatus() {
    await this.load();
    return { status: "online" as const, provider: "mock", lastSuccessfulConnection: now() };
  }

  async listUsers() { await this.load(); return [...this.cloudUsers.values()]; }
  async createUser(input: { username: string; name: string }) { await this.load(); const cloudUser: CloudUser = { id: randomUUID(), ...input, status: "active" }; this.cloudUsers.set(cloudUser.id, cloudUser); await this.persist(); return cloudUser; }

  async listVMs() { await this.load(); return [...this.vms.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
  async getVM(id: string) { await this.load(); return this.vms.get(id); }

  async createVM(input: { ownerId: string; ownerName: string; name: string; image: string; cpu: number; memoryMb: number; diskGb: number; placement?: "automatic" | "manual"; nodeId?: string }) {
    await this.load();
    const created = now();
    const id = randomUUID();
    const online = this.nodes.filter((node) => node.status === "online");
    const requested = input.placement === "manual" && input.nodeId ? online.find((node) => node.id === input.nodeId || node.hostname === input.nodeId) : undefined;
    if (input.placement === "manual" && !requested) throw new Error("INVALID_NODE");
    const host = requested ?? [...online].sort((a, b) => ((a.cpuUsage / 100) + (a.usedMemoryMb / a.memoryMb) + a.runningVmCount * 0.05) - ((b.cpuUsage / 100) + (b.usedMemoryMb / b.memoryMb) + b.runningVmCount * 0.05))[0];
    if (!host || host.cpuUsage + input.cpu / host.cpuCores * 100 > 95 || host.usedMemoryMb + input.memoryMb > host.memoryMb * 0.95) throw new Error("INSUFFICIENT_NODE_CAPACITY");
    const vm: VirtualMachine = { id, externalId: `mock-${id.slice(0, 8)}`, provider: "mock", status: "pending", host: host.hostname, ipAddress: null, createdAt: created, updatedAt: created, ...input };
    this.vms.set(id, vm);
    await this.persist();
    setTimeout(() => {
      const current = this.vms.get(id);
      if (current?.status === "pending") {
        this.vms.set(id, { ...current, status: "running", ipAddress: `10.0.1.${20 + this.vms.size}`, updatedAt: now() });
        void this.persist();
      }
    }, 700);
    return vm;
  }

  private async setStatus(id: string, status: VirtualMachine["status"]) {
    await this.load();
    const vm = this.vms.get(id);
    if (!vm) throw new Error("VM_NOT_FOUND");
    const updated = { ...vm, status, updatedAt: now() };
    this.vms.set(id, updated);
    await this.persist();
    return updated;
  }
  async startVM(id: string) { return this.setStatus(id, "running"); }
  async stopVM(id: string) { return this.setStatus(id, "stopped"); }
  async rebootVM(id: string) { await this.setStatus(id, "pending"); return this.setStatus(id, "running"); }
  async deleteVM(id: string) { await this.load(); if (!this.vms.has(id)) throw new Error("VM_NOT_FOUND"); this.vms.delete(id); await this.persist(); }
  async listNodes() {
    const tick = Math.floor(Date.now() / 5000);
    return this.nodes.map((node, index) => {
      const swing = ((tick + index * 3) % 7) - 3;
      const cpuUsage = Math.max(8, Math.min(92, node.cpuUsage + swing));
      const ramUsage = Math.max(10, Math.min(92, node.ramUsage + (swing % 3)));
      const runningVmCount = [...this.vms.values()].filter((vm) => vm.host === node.hostname && vm.status === "running").length;
      return { ...node, cpuUsage, ramUsage, usedMemoryMb: Math.round(node.memoryMb * ramUsage / 100), runningVmCount, lastSeen: now() };
    });
  }
}

/** Public API adapter for a private cluster-agent deployment. */
export class OpenNebulaProvider implements CloudProvider {
  constructor(private readonly baseUrl: string, private readonly apiKey: string) {}
  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}${path}`, { ...init, headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}`, ...(init?.headers ?? {}) } });
    if (!response.ok) throw new Error(`CLUSTER_AGENT_${response.status}`);
    return response.status === 204 ? (undefined as T) : await response.json() as T;
  }
  async getStatus() { return this.request<{ status: "online" | "offline"; provider: string; lastSuccessfulConnection: string | null }>("/cluster/status"); }
  async listUsers() { return (await this.request<{ users: CloudUser[] }>("/cloud/users")).users; }
  async createUser(input: { username: string; name: string }) { return this.request<CloudUser>("/cloud/users", { method: "POST", body: JSON.stringify(input) }); }
  async listVMs() { return (await this.request<{ vms: VirtualMachine[] }>("/cloud/vms")).vms; }
  async getVM(id: string) { return this.request<VirtualMachine>(`/cloud/vms/${id}`); }
  async createVM(input: { ownerId: string; ownerName: string; name: string; image: string; cpu: number; memoryMb: number; diskGb: number; placement?: "automatic" | "manual"; nodeId?: string }) { return this.request<VirtualMachine>("/cloud/vms", { method: "POST", body: JSON.stringify(input) }); }
  async startVM(id: string) { return this.request<VirtualMachine>(`/cloud/vms/${id}/start`, { method: "POST" }); }
  async stopVM(id: string) { return this.request<VirtualMachine>(`/cloud/vms/${id}/stop`, { method: "POST" }); }
  async rebootVM(id: string) { return this.request<VirtualMachine>(`/cloud/vms/${id}/reboot`, { method: "POST" }); }
  async deleteVM(id: string) { await this.request<void>(`/cloud/vms/${id}`, { method: "DELETE" }); }
  async listNodes() { return (await this.request<{ nodes: ClusterNode[] }>("/cluster/nodes")).nodes; }
}

export class CloudService {
  private readonly benchmarks = new Map<string, Benchmark>();
  private readonly notificationStore = new Map<string, Notification>();
  private readonly demoBootstrapped = new Set<string>();
  private activity: ActivityLog[] = [];
  constructor(private readonly provider: CloudProvider, private readonly users: () => Promise<CurrentUser[]>, private readonly mpi: MPIProvider, private readonly demoData = false) {
    try {
      const saved = JSON.parse(readFileSync(serviceStateFile, "utf8")) as ServiceState;
      for (const benchmark of saved.benchmarks ?? []) this.benchmarks.set(benchmark.id, benchmark);
      for (const notification of saved.notifications ?? []) this.notificationStore.set(notification.id, notification);
      this.activity = saved.activity ?? [];
    } catch {
      // The first local run starts with an empty service history.
    }
  }
  private accounts = new Map<string, CloudAccount>();

  async dashboard(user: CurrentUser) {
    await this.ensureDemoData(user);
    const [status, nodes, vms, users] = await Promise.all([this.provider.getStatus(), this.provider.listNodes(), this.provider.listVMs(), this.users()]);
    const visible = user.role === "admin" ? vms : vms.filter(vm => vm.ownerId === user.id);
    const jobs = await this.mpi.listJobs();
    const benchmarks = [...this.benchmarks.values()].filter((benchmark) => user.role === "admin" || benchmark.userId === user.id).slice(0, 3);
    return { status, nodes, vms: visible.slice(0, 5), metrics: { nodesOnline: nodes.filter(node => node.status === "online").length, nodeCount: nodes.length, runningVms: vms.filter(vm => vm.status === "running").length, runningJobs: jobs.filter(job => ["starting", "running"].includes(job.status)).length, totalUsers: users.length, cpuUsage: Math.round(nodes.reduce((sum, node) => sum + node.cpuUsage, 0) / nodes.length), ramUsage: Math.round(nodes.reduce((sum, node) => sum + node.ramUsage, 0) / nodes.length) }, benchmarks, activity: this.activity.slice(0, 6) };
  }
  async status() { return this.provider.getStatus(); }

  async listVMs(user: CurrentUser) { const vms = await this.provider.listVMs(); return user.role === "admin" ? vms : vms.filter(vm => vm.ownerId === user.id); }
  async getVM(user: CurrentUser, id: string) { const vm = await this.provider.getVM(id); if (!vm || (user.role !== "admin" && vm.ownerId !== user.id)) throw new Error("FORBIDDEN"); return vm; }
  async createVM(user: CurrentUser, input: unknown) {
    const parsed = vmCreateSchema.safeParse(input);
    if (!parsed.success) throw new Error("VALIDATION_ERROR");
    const vm = await this.provider.createVM({ ...parsed.data, ownerId: user.id, ownerName: user.name });
    this.record(user, "VM created", "virtual_machine", vm.id, { name: vm.name, image: vm.image });
    this.record(user, "VM_PLACEMENT_SELECTED", "virtual_machine", vm.id, { host: vm.host ?? "automatic" });
    this.notify(user.id, "VM Created", `${vm.name} is being prepared on ${vm.host ?? "the cluster scheduler"}.`, "success");
    return vm;
  }
  async actionVM(user: CurrentUser, id: string, action: "start" | "stop" | "reboot") {
    const vm = await this.provider.getVM(id);
    if (!vm || (user.role !== "admin" && vm.ownerId !== user.id)) throw new Error("FORBIDDEN");
    const updated = action === "start" ? await this.provider.startVM(id) : action === "stop" ? await this.provider.stopVM(id) : await this.provider.rebootVM(id);
    const actionLabels = { start: "started", stop: "stopped", reboot: "rebooted" } as const;
    this.record(user, `VM ${actionLabels[action]}`, "virtual_machine", id, { name: updated.name });
    return updated;
  }
  async deleteVM(user: CurrentUser, id: string) { const vm = await this.provider.getVM(id); if (!vm || (user.role !== "admin" && vm.ownerId !== user.id)) throw new Error("FORBIDDEN"); await this.provider.deleteVM(id); this.record(user, "VM deleted", "virtual_machine", id, { name: vm.name }); }
  async nodes() { return this.provider.listNodes(); }
  async node(id: string) { const node = (await this.provider.listNodes()).find((item) => item.id === id || item.hostname === id); if (!node) throw new Error("NODE_NOT_FOUND"); const vms = (await this.provider.listVMs()).filter((vm) => vm.host === node.hostname); return { node, vms, activity: this.activity.filter((item) => item.resourceId === node.id || item.metadata.hostname === node.hostname).slice(0, 10) }; }
  async usersList() { return this.users(); }
  async accountsList(user: CurrentUser) {
    const users = await this.users();
    return users
      .filter(member => user.role === "admin" || member.id === user.id)
      .map(member => this.accounts.get(member.id) ?? ({ id: `pending-${member.id}`, userId: member.id, provider: "mock", externalUserId: null, username: null, status: "not_provisioned", createdAt: member.createdAt, updatedAt: member.createdAt } satisfies CloudAccount));
  }
  async provision(user: CurrentUser, userId = user.id) {
    if (user.role !== "admin" && userId !== user.id) throw new Error("FORBIDDEN");
    const existing = this.accounts.get(userId);
    const members = await this.users();
    const member = members.find(candidate => candidate.id === userId);
    if (!member) throw new Error("USER_NOT_FOUND");
    const cloudUser = existing?.externalUserId ? null : await this.provider.createUser({ username: `hpc-${userId.slice(0, 6)}`, name: member.name });
    const account: CloudAccount = { id: existing?.id ?? randomUUID(), userId, provider: "mock", externalUserId: existing?.externalUserId ?? cloudUser?.id ?? null, username: existing?.username ?? cloudUser?.username ?? null, status: "active", createdAt: existing?.createdAt ?? now(), updatedAt: now() };
    this.accounts.set(userId, account); this.record(user, "Cloud account provisioned", "cloud_account", account.id, { userId }); return account;
  }
  activityList(user: CurrentUser) { return user.role === "admin" ? this.activity : this.activity.filter(item => item.userId === user.id); }
  async programs() { return this.mpi.getPrograms(); }
  async jobsList(user: CurrentUser) { return (await this.mpi.listJobs()).filter(job => user.role === "admin" || job.userId === user.id); }
  async getJob(user: CurrentUser, id: string) { const job = await this.mpi.getJob(id); if (!job || (user.role !== "admin" && job.userId !== user.id)) throw new Error("FORBIDDEN"); return job; }
  async createJob(user: CurrentUser, input: unknown) {
    const parsed = submitMpiJobSchema.safeParse(input); if (!parsed.success) throw new Error("VALIDATION_ERROR");
    const job = await this.mpi.submitJob({ ...parsed.data, userId: user.id, userName: user.name });
    this.record(user, "MPI_JOB_SUBMITTED", "mpi_job", job.id, { program: job.program, processCount: job.processCount });
    this.notify(user.id, "MPI Job Submitted", `${job.name} has been queued for execution.`, "info");
    setTimeout(async () => { const current = await this.mpi.getJob(job.id); if (current && ["starting", "running"].includes(current.status)) this.record(user, "MPI_JOB_STARTED", "mpi_job", job.id, { processCount: current.processCount }); }, 520);
    setTimeout(async () => { const current = await this.mpi.getJob(job.id); if (current?.status === "completed") { this.record(user, "MPI_JOB_COMPLETED", "mpi_job", job.id, { executionTimeMs: current.executionTimeMs ?? 0 }); this.notify(user.id, "MPI Job Completed", `${current.name} finished in ${((current.executionTimeMs ?? 0) / 1000).toFixed(2)} seconds.`, "success"); } else if (current?.status === "failed") { this.record(user, "MPI_JOB_FAILED", "mpi_job", job.id, { error: current.error ?? "unknown" }); this.notify(user.id, "MPI Job Failed", `${current.name} could not be completed.`, "error"); } }, 1600);
    return job;
  }
  async cancelJob(user: CurrentUser, id: string) { const job = await this.getJob(user, id); await this.mpi.cancelJob(job.id); this.notify(user.id, "MPI Job Cancelled", `${job.name} was cancelled.`, "warning"); }
  async listBenchmarks(user: CurrentUser) { return [...this.benchmarks.values()].filter((benchmark) => user.role === "admin" || benchmark.userId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
  async getBenchmark(user: CurrentUser, id: string) { const benchmark = this.benchmarks.get(id); if (!benchmark || (user.role !== "admin" && benchmark.userId !== user.id)) throw new Error("FORBIDDEN"); return benchmark; }
  async createBenchmark(user: CurrentUser, input: unknown) { const parsed = benchmarkCreateSchema.safeParse(input); if (!parsed.success) throw new Error("VALIDATION_ERROR"); const benchmark: Benchmark = { id: randomUUID(), userId: user.id, userName: user.name, program: parsed.data.program, status: "running", createdAt: now(), completedAt: null, runs: [] }; this.benchmarks.set(benchmark.id, benchmark); this.persistService(); this.record(user, "BENCHMARK_STARTED", "benchmark", benchmark.id, { program: benchmark.program }); for (const processCount of [...new Set(parsed.data.processCounts)].sort((a, b) => a - b)) { const job = await this.mpi.submitJob({ name: `Benchmark ${benchmark.program} ${processCount}p`, program: benchmark.program, processCount, nodeSelection: "automatic", userId: user.id, userName: user.name }); const started = Date.now(); await new Promise((resolve) => setTimeout(resolve, 1250)); const finished = await this.mpi.getJob(job.id); const run: BenchmarkRun = { id: randomUUID(), benchmarkId: benchmark.id, processCount, nodeCount: finished?.nodesUsed.length ?? 1, executionTimeMs: finished?.executionTimeMs ?? (Date.now() - started), status: finished?.status === "completed" ? "completed" : "failed", result: finished?.output ?? finished?.error ?? null, createdAt: now() }; benchmark.runs.push(run); this.persistService(); } benchmark.status = benchmark.runs.every((run) => run.status === "completed") ? "completed" : "failed"; benchmark.completedAt = now(); this.record(user, "BENCHMARK_COMPLETED", "benchmark", benchmark.id, { runs: benchmark.runs.length, status: benchmark.status }); this.notify(user.id, "Benchmark Completed", `${MPI_PROGRAMS_LABEL[benchmark.program] ?? benchmark.program} benchmark results are ready.`, benchmark.status === "completed" ? "success" : "error"); return benchmark; }
  notifications(user: CurrentUser) { return [...this.notificationStore.values()].filter((notification) => notification.userId === null || notification.userId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
  markNotificationRead(user: CurrentUser, id: string) { const item = this.notificationStore.get(id); if (!item || (item.userId !== null && item.userId !== user.id)) throw new Error("FORBIDDEN"); item.read = true; return item; }
  private notify(userId: string | null, title: string, message: string, type: Notification["type"]) { const notification: Notification = { id: randomUUID(), userId, title, message, type, read: false, createdAt: now() }; this.notificationStore.set(notification.id, notification); this.persistService(); }
  private record(user: CurrentUser, action: string, resourceType: string, resourceId: string | null, metadata: ActivityLog["metadata"]) { this.activity.unshift({ id: randomUUID(), userId: user.id, userName: user.name, action, resourceType, resourceId, metadata, createdAt: now() }); this.activity = this.activity.slice(0, 100); this.persistService(); }
  private persistService() { mkdirSync(dirname(serviceStateFile), { recursive: true }); writeFileSync(serviceStateFile, JSON.stringify({ activity: this.activity, benchmarks: [...this.benchmarks.values()], notifications: [...this.notificationStore.values()] } satisfies ServiceState, null, 2), { mode: 0o600 }); }
  private async ensureDemoData(user: CurrentUser) {
    if (!this.demoData || this.demoBootstrapped.has(user.id) || !(this.provider instanceof MockCloudProvider) || !(this.mpi instanceof MockMPIProvider)) return;
    this.demoBootstrapped.add(user.id);
    const vms = await this.provider.listVMs();
    if (!vms.some((vm) => vm.ownerId === user.id)) {
      await this.provider.createVM({ ownerId: user.id, ownerName: user.name, name: "demo-mpi-worker", image: "Ubuntu 24.04 LTS", cpu: 2, memoryMb: 2048, diskGb: 10, placement: "automatic" });
      await this.provider.createVM({ ownerId: user.id, ownerName: user.name, name: "demo-research-vm", image: "Rocky Linux 9", cpu: 1, memoryMb: 1024, diskGb: 5, placement: "automatic" });
    }
    if (![...this.benchmarks.values()].some((benchmark) => benchmark.userId === user.id)) {
      const createdAt = now();
      const benchmarkId = randomUUID();
      const runs = [1, 2, 4, 8].map((processCount) => ({ id: randomUUID(), benchmarkId, processCount, nodeCount: Math.max(1, Math.ceil(processCount / 4)), executionTimeMs: Math.round(8400 / Math.pow(processCount, 0.82)), status: "completed" as const, result: "Demo benchmark result", createdAt }));
      this.benchmarks.set(benchmarkId, { id: benchmarkId, userId: user.id, userName: user.name, program: "matrix-multiply", status: "completed", createdAt, completedAt: createdAt, runs });
      this.persistService();
    }
    if (!(await this.mpi.listJobs()).some((job) => job.userId === user.id)) await this.mpi.submitJob({ name: "Demo matrix run", program: "matrix-multiply", processCount: 4, nodeSelection: "automatic", userId: user.id, userName: user.name });
  }
}

const MPI_PROGRAMS_LABEL: Record<string, string> = { "calculate-pi": "Calculate Pi", "matrix-multiply": "Matrix Multiplication", "vector-addition": "Vector Addition" };

export function createCloudService(users: () => Promise<CurrentUser[]>, options?: { provider?: "mock" | "opennebula"; agentUrl?: string; agentApiKey?: string; demoData?: boolean }) {
  const provider = options?.provider === "opennebula" && options.agentUrl && options.agentApiKey ? new OpenNebulaProvider(options.agentUrl, options.agentApiKey) : new MockCloudProvider();
  const mpi = options?.provider === "opennebula" && options.agentUrl && options.agentApiKey ? new ClusterMPIProvider(options.agentUrl, options.agentApiKey) : new MockMPIProvider(provider);
  return new CloudService(provider, users, mpi, options?.demoData ?? false);
}
