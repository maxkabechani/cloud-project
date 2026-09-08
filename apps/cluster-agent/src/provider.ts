import type { CloudUser, ClusterNode, MpiJob, VirtualMachine } from "@hpc/shared";
import { randomUUID } from "node:crypto";

export interface AgentProvider {
  status(): { status: "online"; provider: "mock"; lastSuccessfulConnection: string };
  nodes(): ClusterNode[];
  users(): CloudUser[];
  createUser(input: { username: string; name: string }): CloudUser;
  vms(): VirtualMachine[];
  createVm(input: { name: string; image: string; cpu: number; memoryMb: number; diskGb: number; ownerId: string; ownerName: string }): VirtualMachine;
  vm(id: string): VirtualMachine | undefined;
  vmAction(id: string, action: "start" | "stop" | "reboot"): VirtualMachine | undefined;
  deleteVm(id: string): boolean;
  jobs(): MpiJob[];
  createJob(input: { name: string; program: MpiJob["program"]; processCount: number; userId: string; userName: string }): MpiJob;
  job(id: string): MpiJob | undefined;
}

export class MockAgentProvider implements AgentProvider {
  private readonly vmStore = new Map<string, VirtualMachine>();
  private readonly userStore = new Map<string, CloudUser>();
  private readonly jobStore = new Map<string, MpiJob>();
  private readonly nodeStore: ClusterNode[] = ["master", "node01", "node02", "node03"].map((hostname, index) => ({ id: `agent-node-${index + 1}`, hostname, ipAddress: `10.0.0.${10 + index}`, status: "online", cpuUsage: index === 0 ? 31 : 20 + index * 7, ramUsage: 40 + index * 5, diskUsage: 36 + index * 3, cpuCores: index === 0 ? 8 : 16, memoryMb: index === 0 ? 16384 : 32768, uptime: "12d 04h", lastSeen: new Date().toISOString() }));

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
  createJob(input: Parameters<AgentProvider["createJob"]>[0]) { const job: MpiJob = { ...input, id: randomUUID(), status: "queued", output: null, startedAt: null, completedAt: null, createdAt: new Date().toISOString() }; this.jobStore.set(job.id, job); setTimeout(() => { const current = this.jobStore.get(job.id); if (!current) return; current.status = "completed"; current.startedAt = new Date().toISOString(); current.completedAt = new Date().toISOString(); current.output = `Completed ${current.program} with ${current.processCount} MPI processes.`; }, 600); return job; }
  job(id: string) { return this.jobStore.get(id); }
}
