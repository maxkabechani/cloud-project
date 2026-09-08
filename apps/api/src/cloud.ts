import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  vmCreateSchema,
  type ActivityLog,
  type CloudAccount,
  type CloudUser,
  type ClusterNode,
  type CurrentUser,
  type MpiJob,
  type VirtualMachine,
} from "@hpc/shared";

export interface CloudProvider {
  getStatus(): Promise<{ status: "online" | "offline"; provider: string; lastSuccessfulConnection: string | null }>;
  listUsers(): Promise<CloudUser[]>;
  createUser(input: { username: string; name: string }): Promise<CloudUser>;
  listVMs(): Promise<VirtualMachine[]>;
  getVM(id: string): Promise<VirtualMachine | undefined>;
  createVM(input: { ownerId: string; ownerName: string; name: string; image: string; cpu: number; memoryMb: number; diskGb: number }): Promise<VirtualMachine>;
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

const now = () => new Date().toISOString();
const stateFile = resolve(process.cwd(), ".local/cloud-state.json");

export class MockCloudProvider implements CloudProvider {
  private vms = new Map<string, VirtualMachine>();
  private cloudUsers = new Map<string, CloudUser>();
  private nodes: ClusterNode[] = [
    { id: "master", hostname: "master", ipAddress: "10.0.0.10", status: "online", cpuUsage: 42, ramUsage: 58, diskUsage: 37, cpuCores: 16, memoryMb: 32768, uptime: "18d 04h", lastSeen: now() },
    { id: "node01", hostname: "node01", ipAddress: "10.0.0.11", status: "online", cpuUsage: 68, ramUsage: 54, diskUsage: 41, cpuCores: 32, memoryMb: 65536, uptime: "18d 04h", lastSeen: now() },
    { id: "node02", hostname: "node02", ipAddress: "10.0.0.12", status: "online", cpuUsage: 51, ramUsage: 47, diskUsage: 39, cpuCores: 32, memoryMb: 65536, uptime: "18d 04h", lastSeen: now() },
    { id: "node03", hostname: "node03", ipAddress: "10.0.0.13", status: "online", cpuUsage: 29, ramUsage: 34, diskUsage: 45, cpuCores: 32, memoryMb: 65536, uptime: "18d 04h", lastSeen: now() },
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

  async createVM(input: { ownerId: string; ownerName: string; name: string; image: string; cpu: number; memoryMb: number; diskGb: number }) {
    await this.load();
    const created = now();
    const id = randomUUID();
    const vm: VirtualMachine = { id, externalId: `mock-${id.slice(0, 8)}`, provider: "mock", status: "pending", host: "node01", ipAddress: null, createdAt: created, updatedAt: created, ...input };
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
  async listNodes() { return this.nodes.map(node => ({ ...node, lastSeen: now() })); }
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
  async createVM(input: { ownerId: string; ownerName: string; name: string; image: string; cpu: number; memoryMb: number; diskGb: number }) { return this.request<VirtualMachine>("/cloud/vms", { method: "POST", body: JSON.stringify(input) }); }
  async startVM(id: string) { return this.request<VirtualMachine>(`/cloud/vms/${id}/start`, { method: "POST" }); }
  async stopVM(id: string) { return this.request<VirtualMachine>(`/cloud/vms/${id}/stop`, { method: "POST" }); }
  async rebootVM(id: string) { return this.request<VirtualMachine>(`/cloud/vms/${id}/reboot`, { method: "POST" }); }
  async deleteVM(id: string) { await this.request<void>(`/cloud/vms/${id}`, { method: "DELETE" }); }
  async listNodes() { return (await this.request<{ nodes: ClusterNode[] }>("/cluster/nodes")).nodes; }
}

export class CloudService {
  constructor(private readonly provider: CloudProvider, private readonly users: () => Promise<CurrentUser[]>) {}
  private accounts = new Map<string, CloudAccount>();
  private activity: ActivityLog[] = [];
  private jobs = new Map<string, MpiJob>();

  async dashboard(user: CurrentUser) {
    const [status, nodes, vms, users] = await Promise.all([this.provider.getStatus(), this.provider.listNodes(), this.provider.listVMs(), this.users()]);
    const visible = user.role === "admin" ? vms : vms.filter(vm => vm.ownerId === user.id);
    return { status, nodes, vms: visible.slice(0, 5), metrics: { nodesOnline: nodes.filter(node => node.status === "online").length, nodeCount: nodes.length, runningVms: vms.filter(vm => vm.status === "running").length, totalUsers: users.length, cpuUsage: Math.round(nodes.reduce((sum, node) => sum + node.cpuUsage, 0) / nodes.length), ramUsage: Math.round(nodes.reduce((sum, node) => sum + node.ramUsage, 0) / nodes.length) }, activity: this.activity.slice(0, 6) };
  }
  async status() { return this.provider.getStatus(); }

  async listVMs(user: CurrentUser) { const vms = await this.provider.listVMs(); return user.role === "admin" ? vms : vms.filter(vm => vm.ownerId === user.id); }
  async getVM(user: CurrentUser, id: string) { const vm = await this.provider.getVM(id); if (!vm || (user.role !== "admin" && vm.ownerId !== user.id)) throw new Error("FORBIDDEN"); return vm; }
  async createVM(user: CurrentUser, input: unknown) {
    const parsed = vmCreateSchema.safeParse(input);
    if (!parsed.success) throw new Error("VALIDATION_ERROR");
    const vm = await this.provider.createVM({ ...parsed.data, ownerId: user.id, ownerName: user.name });
    this.record(user, "VM created", "virtual_machine", vm.id, { name: vm.name, image: vm.image });
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
  async jobsList(user: CurrentUser) { return [...this.jobs.values()].filter(job => user.role === "admin" || job.userId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
  async createJob(user: CurrentUser, input: { name: string; program: MpiJob["program"]; processCount: number }) {
    const job: MpiJob = { id: randomUUID(), userId: user.id, userName: user.name, ...input, status: "queued", output: null, startedAt: null, completedAt: null, createdAt: now() };
    this.jobs.set(job.id, job); this.record(user, "MPI job submitted", "mpi_job", job.id, { program: job.program, processCount: job.processCount });
    setTimeout(() => { const current = this.jobs.get(job.id); if (!current) return; const started = now(); this.jobs.set(job.id, { ...current, status: "running", startedAt: started }); setTimeout(() => { const running = this.jobs.get(job.id); if (running) this.jobs.set(job.id, { ...running, status: "completed", output: `${running.program} completed across ${running.processCount} processes.`, completedAt: now() }); }, 900); }, 400);
    return job;
  }
  private record(user: CurrentUser, action: string, resourceType: string, resourceId: string | null, metadata: ActivityLog["metadata"]) { this.activity.unshift({ id: randomUUID(), userId: user.id, userName: user.name, action, resourceType, resourceId, metadata, createdAt: now() }); this.activity = this.activity.slice(0, 100); }
}

export function createCloudService(users: () => Promise<CurrentUser[]>, options?: { provider?: "mock" | "opennebula"; agentUrl?: string; agentApiKey?: string }) {
  const provider = options?.provider === "opennebula" && options.agentUrl && options.agentApiKey ? new OpenNebulaProvider(options.agentUrl, options.agentApiKey) : new MockCloudProvider();
  return new CloudService(provider, users);
}
