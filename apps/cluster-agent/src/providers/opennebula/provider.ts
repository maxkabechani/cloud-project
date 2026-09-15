import type { CloudUser, ClusterNode, MpiJob, MpiProgram, VirtualMachine } from "@hpc/shared";
import type { AgentProvider } from "../../provider";
import { OpenNebulaClient, decodeXml } from "./client";
import type { OpenNebulaClientOptions } from "./types";

const vmStates: Record<string, VirtualMachine["status"]> = { INIT: "pending", PENDING: "pending", HOLD: "pending", ACTIVE: "running", STOPPED: "stopped", SUSPENDED: "stopped", DONE: "stopped", FAILED: "error", POWEROFF: "stopped", UNDEPLOYED: "stopped", CLONING: "pending", CLONING_FAILURE: "error" };

export class OpenNebulaAgentProvider implements AgentProvider {
  private readonly client: OpenNebulaClient;
  private readonly auth: string;

  constructor(options: OpenNebulaClientOptions) {
    this.client = new OpenNebulaClient(options);
    this.auth = `${options.username}:${options.password}`;
  }

  async status() { await this.client.call("one.system.version", [this.auth]); return { status: "online" as const, provider: "opennebula" as const, lastSuccessfulConnection: new Date().toISOString() }; }

  async nodes(): Promise<ClusterNode[]> {
    const xml = await this.client.call("one.hostpool.info", [this.auth]);
    return records(xml, "HOST").map((host, index) => {
      const maxCpu = number(host, "MAX_CPU");
      const usedCpu = number(host, "USED_CPU");
      const memoryMb = Math.round(number(host, "MAX_MEM") / 1024);
      const usedMemoryMb = Math.round(number(host, "USED_MEM") / 1024);
      return { id: field(host, "ID") || `host-${index}`, hostname: field(host, "NAME") || `node-${index + 1}`, ipAddress: field(host, "IM_MAD") || "unknown", status: field(host, "STATE") === "2" ? "online" : "offline", cpuUsage: maxCpu ? Math.round((usedCpu / maxCpu) * 100) : 0, ramUsage: memoryMb ? Math.round((usedMemoryMb / memoryMb) * 100) : 0, diskUsage: 0, cpuCores: Math.max(1, Math.round(maxCpu / 100)), memoryMb, usedMemoryMb, runningVmCount: number(host, "RUNNING_VMS"), uptime: "unknown", lastSeen: new Date().toISOString() } satisfies ClusterNode;
    });
  }

  async vms() { const xml = await this.client.call("one.vmpool.info", [this.auth, "-2", "-1", "-1", "-1", "-1"]); return records(xml, "VM").map((vm) => this.toVm(vm)); }
  async vm(id: string) { const externalId = id.replace(/^one-/, ""); const xml = await this.client.call("one.vm.info", [this.auth, externalId]); return this.toVm(xml); }

  async createVm(input: Parameters<AgentProvider["createVm"]>[0] & { placement?: "automatic" | "manual"; nodeId?: string }) {
    const imageId = await this.findImage(input.image);
    const placement = input.nodeId ? `SCHED_REQUIREMENTS = "NAME = \\\"${escapeTemplate(input.nodeId)}\\\""` : "";
    const template = [`NAME = "${escapeTemplate(input.name)}"`, `CPU = "${input.cpu}"`, `VCPU = "${input.cpu}"`, `MEMORY = "${input.memoryMb}"`, `DISK = [ IMAGE_ID = "${imageId}", SIZE = "${input.diskGb * 1024}" ]`, `HPC_OWNER_ID = "${escapeTemplate(input.ownerId)}"`, `HPC_OWNER_NAME = "${escapeTemplate(input.ownerName)}"`, placement].filter(Boolean).join("\n");
    const externalId = await this.client.call("one.vm.allocate", [this.auth, template]);
    const now = new Date().toISOString();
    return { id: `one-${externalId}`, externalId, ownerId: input.ownerId, ownerName: input.ownerName, name: input.name, provider: "opennebula" as const, status: "pending" as const, cpu: input.cpu, memoryMb: input.memoryMb, diskGb: input.diskGb, image: input.image, host: input.nodeId ?? null, ipAddress: null, createdAt: now, updatedAt: now } satisfies VirtualMachine;
  }

  async vmAction(id: string, action: "start" | "stop" | "reboot") { const externalId = id.replace(/^one-/, ""); const actionName = action === "start" ? "resume" : action === "stop" ? "stop" : "reboot"; await this.client.call("one.vm.action", [this.auth, actionName, externalId]); return this.vm(id); }
  async deleteVm(id: string) { await this.client.call("one.vm.delete", [this.auth, id.replace(/^one-/, "")]); return true; }
  async users() { return [] as CloudUser[]; }
  async createUser(): Promise<CloudUser> { throw new Error("OPENNEBULA_USER_PROVISIONING_NOT_CONFIGURED"); }
  jobs() { return [] as MpiJob[]; }
  createJob(): Promise<MpiJob> { throw new Error("OPENNEBULA_MPI_NOT_CONFIGURED"); }
  job() { return undefined; }
  cancelJob() { return false; }
  programs() { return [{ id: "calculate-pi", name: "Calculate Pi", description: "Estimate π using parallel numerical integration.", defaultExecutionTimeMs: 720 }, { id: "matrix-multiply", name: "Matrix Multiplication", description: "Multiply distributed matrices across MPI processes.", defaultExecutionTimeMs: 8400 }, { id: "vector-addition", name: "Vector Addition", description: "Add distributed vectors in parallel.", defaultExecutionTimeMs: 2100 }] satisfies MpiProgram[]; }

  private async findImage(imageName: string) { const xml = await this.client.call("one.imagepool.info", [this.auth, "-2", "-1", "-1"]); const image = records(xml, "IMAGE").find((item) => field(item, "NAME").toLowerCase() === imageName.toLowerCase()); if (!image) throw new Error(`OPENNEBULA_IMAGE_NOT_FOUND:${imageName}`); return field(image, "ID"); }
  private toVm(xml: string): VirtualMachine { const id = field(xml, "ID"); const state = field(xml, "STATE") || "UNKNOWN"; const template = field(xml, "TEMPLATE"); const now = new Date().toISOString(); return { id: `one-${id}`, externalId: id, ownerId: field(template, "HPC_OWNER_ID") || "agent", ownerName: field(template, "HPC_OWNER_NAME") || "Cluster API", name: field(xml, "NAME") || `VM ${id}`, provider: "opennebula", status: vmStates[state] ?? "unknown", cpu: number(xml, "CPU"), memoryMb: number(xml, "MEMORY"), diskGb: 0, image: field(template, "IMAGE") || "OpenNebula image", host: field(xml, "HOSTNAME") || null, ipAddress: field(xml, "IP") || null, createdAt: field(xml, "REGTIME") ? new Date(Number(field(xml, "REGTIME")) * 1000).toISOString() : now, updatedAt: now };
  }
}

function records(xml: string, tag: string) { return [...xml.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "gi"))].map((match) => match[1]); }
function field(xml: string, name: string) { return decodeXml(xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, "i"))?.[1]?.trim() ?? ""); }
function number(xml: string, name: string) { const parsed = Number(field(xml, name)); return Number.isFinite(parsed) ? parsed : 0; }
function escapeTemplate(value: string) { return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"'); }
