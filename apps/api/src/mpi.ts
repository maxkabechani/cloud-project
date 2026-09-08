import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { ClusterNode, MpiJob, MpiProgram, MpiProgramId } from "@hpc/shared";

export const MPI_PROGRAMS: Record<MpiProgramId, MpiProgram> = {
  "calculate-pi": { id: "calculate-pi", name: "Calculate Pi", description: "Estimate π using parallel numerical integration.", defaultExecutionTimeMs: 720 },
  "matrix-multiply": { id: "matrix-multiply", name: "Matrix Multiplication", description: "Multiply distributed matrices across MPI processes.", defaultExecutionTimeMs: 8400 },
  "vector-addition": { id: "vector-addition", name: "Vector Addition", description: "Add distributed vectors in parallel.", defaultExecutionTimeMs: 2100 },
};

export interface MPIProvider {
  getPrograms(): Promise<MpiProgram[]>;
  submitJob(input: { name: string; program: MpiProgramId; processCount: number; nodeSelection: "automatic" | string[]; userId: string; userName: string }): Promise<MpiJob>;
  getJob(id: string): Promise<MpiJob | undefined>;
  listJobs(): Promise<MpiJob[]>;
  cancelJob(id: string): Promise<void>;
}

export interface NodeSource {
  listNodes(): Promise<ClusterNode[]>;
}

type Persisted = { jobs: MpiJob[] };
const stateFile = resolve(process.cwd(), ".local/mpi-state.json");
const now = () => new Date().toISOString();

export class MockMPIProvider implements MPIProvider {
  private readonly jobs = new Map<string, MpiJob>();
  private loaded = false;

  constructor(private readonly nodes: NodeSource) {}

  async getPrograms() { return Object.values(MPI_PROGRAMS); }

  private async load() {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const state = JSON.parse(await readFile(stateFile, "utf8")) as Persisted;
      for (const job of state.jobs ?? []) this.jobs.set(job.id, { ...job, nodeSelection: job.nodeSelection ?? "automatic", nodesUsed: job.nodesUsed ?? [], error: job.error ?? null, executionTimeMs: job.executionTimeMs ?? null });
    } catch {
      // First run is intentionally empty.
    }
  }

  private async persist() {
    await mkdir(dirname(stateFile), { recursive: true });
    await writeFile(stateFile, JSON.stringify({ jobs: [...this.jobs.values()] } satisfies Persisted, null, 2), { mode: 0o600 });
  }

  private async selectNodes(processCount: number, selection: "automatic" | string[]) {
    const online = (await this.nodes.listNodes()).filter((node) => node.status === "online");
    const selected = selection === "automatic" ? online.sort((a, b) => (a.cpuUsage + a.ramUsage) - (b.cpuUsage + b.ramUsage)) : online.filter((node) => selection.includes(node.id) || selection.includes(node.hostname));
    if (!selected.length) throw new Error("NO_MPI_NODES");
    const needed = Math.max(1, Math.ceil(processCount / 4));
    if (selected.length < needed) throw new Error("INSUFFICIENT_MPI_NODES");
    return selected.slice(0, needed).map((node) => node.hostname);
  }

  async submitJob(input: Parameters<MPIProvider["submitJob"]>[0]) {
    await this.load();
    if (!MPI_PROGRAMS[input.program]) throw new Error("INVALID_MPI_PROGRAM");
    const nodesUsed = await this.selectNodes(input.processCount, input.nodeSelection);
    const job: MpiJob = { id: randomUUID(), ...input, nodesUsed, status: "queued", output: null, error: null, executionTimeMs: null, startedAt: null, completedAt: null, createdAt: now() };
    this.jobs.set(job.id, job);
    await this.persist();
    setTimeout(() => void this.start(job.id), 180);
    return job;
  }

  private async start(id: string) {
    const queued = this.jobs.get(id);
    if (!queued || queued.status === "cancelled") return;
    this.jobs.set(id, { ...queued, status: "starting" });
    await this.persist();
    setTimeout(() => void this.complete(id), 280);
  }

  private async complete(id: string) {
    const starting = this.jobs.get(id);
    if (!starting || starting.status === "cancelled") return;
    const startedAt = now();
    this.jobs.set(id, { ...starting, status: "running", startedAt });
    await this.persist();
    setTimeout(async () => {
      const running = this.jobs.get(id);
      if (!running || running.status === "cancelled") return;
      const program = MPI_PROGRAMS[running.program];
      const executionTimeMs = Math.round(program.defaultExecutionTimeMs / Math.pow(running.processCount, 0.82) + running.nodesUsed.length * 35);
      const completedAt = now();
      this.jobs.set(id, { ...running, status: "completed", executionTimeMs, completedAt, output: `${program.name} completed successfully across ${running.nodesUsed.join(", ")} using ${running.processCount} MPI processes.` });
      await this.persist();
    }, 650);
  }

  async getJob(id: string) { await this.load(); return this.jobs.get(id); }
  async listJobs() { await this.load(); return [...this.jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
  async cancelJob(id: string) { await this.load(); const job = this.jobs.get(id); if (!job) throw new Error("MPI_JOB_NOT_FOUND"); if (["completed", "failed", "cancelled"].includes(job.status)) return; this.jobs.set(id, { ...job, status: "cancelled", completedAt: now(), error: "Cancelled by the user." }); await this.persist(); }
}

export class ClusterMPIProvider implements MPIProvider {
  constructor(private readonly baseUrl: string, private readonly apiKey: string) {}
  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}${path}`, { ...init, headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}`, ...(init?.headers ?? {}) } });
    if (!response.ok) throw new Error(`CLUSTER_AGENT_${response.status}`);
    return response.status === 204 ? (undefined as T) : await response.json() as T;
  }
  async getPrograms() { return (await this.request<{ programs: MpiProgram[] }>("/mpi/programs")).programs; }
  async submitJob(input: Parameters<MPIProvider["submitJob"]>[0]) { return this.request<MpiJob>("/mpi/jobs", { method: "POST", body: JSON.stringify(input) }); }
  async getJob(id: string) { return this.request<MpiJob>(`/mpi/jobs/${id}`); }
  async listJobs() { return (await this.request<{ jobs: MpiJob[] }>("/mpi/jobs")).jobs; }
  async cancelJob(id: string) { await this.request<void>(`/mpi/jobs/${id}/cancel`, { method: "POST" }); }
}
