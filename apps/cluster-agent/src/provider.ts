import type { CloudUser, ClusterNode, MpiJob, MpiProgram, VirtualMachine } from "@hpc/shared";
import { randomUUID } from "node:crypto";

export interface AgentProvider {
  status(): Promise<{ status: "online"; provider: "opennebula" | "mock"; lastSuccessfulConnection: string }> | { status: "online"; provider: "opennebula" | "mock"; lastSuccessfulConnection: string };
  nodes(): Promise<ClusterNode[]> | ClusterNode[];
  users(): Promise<CloudUser[]> | CloudUser[];
  createUser(input: { username: string; name: string }): Promise<CloudUser> | CloudUser;
  vms(): Promise<VirtualMachine[]> | VirtualMachine[];
  createVm(input: { name: string; image: string; cpu: number; memoryMb: number; diskGb: number; placement?: "automatic" | "manual"; nodeId?: string; ownerId: string; ownerName: string }): Promise<VirtualMachine> | VirtualMachine;
  vm(id: string): Promise<VirtualMachine | undefined> | VirtualMachine | undefined;
  vmAction(id: string, action: "start" | "stop" | "reboot"): Promise<VirtualMachine | undefined> | VirtualMachine | undefined;
  deleteVm(id: string): Promise<boolean> | boolean;
  jobs(): Promise<MpiJob[]> | MpiJob[];
  createJob(input: { name: string; program: MpiJob["program"]; processCount: number; userId: string; userName: string }): Promise<MpiJob> | MpiJob;
  job(id: string): Promise<MpiJob | undefined> | MpiJob | undefined;
  cancelJob(id: string): Promise<boolean> | boolean;
  programs(): Promise<MpiProgram[]> | MpiProgram[];
}

export class MockAgentProvider implements AgentProvider {
  private readonly vmStore = new Map<string, VirtualMachine>();
  private readonly userStore = new Map<string, CloudUser>();
  private readonly jobStore = new Map<string, MpiJob>();
  private readonly nodeStore: ClusterNode[] = ["master", "node01", "node02", "node03"].map((hostname, index) => ({ id: `agent-node-${index + 1}`, hostname, ipAddress: `10.0.0.${10 + index}`, status: "online", cpuUsage: index === 0 ? 31 : 20 + index * 7, ramUsage: 40 + index * 5, diskUsage: 36 + index * 3, cpuCores: index === 0 ? 8 : 16, memoryMb: index === 0 ? 16384 : 32768, usedMemoryMb: Math.round((index === 0 ? 40 : 45 + index * 5) * (index === 0 ? 16384 : 32768) / 100), runningVmCount: index, uptime: "12d 04h", lastSeen: new Date().toISOString() }));

  status() { return { status: "online" as const, provider: "mock" as const, lastSuccessfulConnection: new Date().toISOString() }; }
  nodes() { return this.nodeStore; }
  users() { return [...this.userStore.values()]; }
  createUser(input: Parameters<AgentProvider["createUser"]>[0]) { const user: CloudUser = { ...input, id: randomUUID(), status: "active" }; this.userStore.set(user.id, user); return user; }
  vms() { return [...this.vmStore.values()]; }
  createVm(input: Parameters<AgentProvider["createVm"]>[0]) { const now = new Date().toISOString(); const vm: VirtualMachine = { ...input, id: randomUUID(), externalId: `mock-${Date.now()}`, provider: "mock", status: "running", host: "node01", ipAddress: `10.0.1.${this.vmStore.size + 20}`, createdAt: now, updatedAt: now }; this.vmStore.set(vm.id, vm); return vm; }
  vm(id: string) { return this.vmStore.get(id); }
  vmAction(id: string, action: "start" | "stop" | "reboot") { const vm = this.vmStore.get(id); if (!vm) return undefined; vm.status = action === "stop" ? "stopped" : "running"; vm.updatedAt = new Date().toISOString(); return vm; }
  deleteVm(id: string) { return this.vmStore.delete(id); }
  jobs() { return [...this.jobStore.values()]; }
  createJob(input: Parameters<AgentProvider["createJob"]>[0]) { const job: MpiJob = { ...input, nodeSelection: "automatic", nodesUsed: this.nodeStore.filter((node) => node.status === "online").slice(0, Math.max(1, Math.ceil(input.processCount / 4))).map((node) => node.hostname), id: randomUUID(), status: "queued", output: null, error: null, executionTimeMs: null, startedAt: null, completedAt: null, createdAt: new Date().toISOString() }; this.jobStore.set(job.id, job); setTimeout(() => { const current = this.jobStore.get(job.id); if (!current || current.status === "cancelled") return; current.status = "starting"; current.startedAt = new Date().toISOString(); setTimeout(() => { const latest = this.jobStore.get(job.id); if (!latest || latest.status === "cancelled") return; latest.status = "completed"; latest.completedAt = new Date().toISOString(); latest.executionTimeMs = 600; latest.output = `Completed ${latest.program} with ${latest.processCount} MPI processes.`; }, 450); }, 180); return job; }
  job(id: string) { return this.jobStore.get(id); }
  cancelJob(id: string) { const job = this.jobStore.get(id); if (!job) return false; if (!['completed', 'failed', 'cancelled'].includes(job.status)) { job.status = 'cancelled'; job.completedAt = new Date().toISOString(); job.error = 'Cancelled by the user.'; } return true; }
  programs() { return [{ id: "calculate-pi", name: "Calculate Pi", description: "Estimate π using parallel numerical integration.", defaultExecutionTimeMs: 720 }, { id: "matrix-multiply", name: "Matrix Multiplication", description: "Multiply distributed matrices across MPI processes.", defaultExecutionTimeMs: 8400 }, { id: "vector-addition", name: "Vector Addition", description: "Add distributed vectors in parallel.", defaultExecutionTimeMs: 2100 }] satisfies MpiProgram[]; }
}
