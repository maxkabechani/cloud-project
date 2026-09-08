import { describe, expect, it } from "bun:test";
import { MockCloudProvider } from "../apps/api/src/cloud";
import { MockMPIProvider } from "../apps/api/src/mpi";
import type { ClusterNode } from "../packages/shared/src/index";

const nodes: ClusterNode[] = [
  { id: "offline", hostname: "offline", ipAddress: "10.0.0.2", status: "offline", cpuUsage: 1, ramUsage: 1, diskUsage: 1, cpuCores: 8, memoryMb: 8192, usedMemoryMb: 80, runningVmCount: 0, uptime: "0m", lastSeen: new Date(Date.now() - 120000).toISOString() },
  { id: "worker-a", hostname: "worker-a", ipAddress: "10.0.0.3", status: "online", cpuUsage: 70, ramUsage: 70, diskUsage: 20, cpuCores: 8, memoryMb: 8192, usedMemoryMb: 5734, runningVmCount: 3, uptime: "2h", lastSeen: new Date().toISOString() },
  { id: "worker-b", hostname: "worker-b", ipAddress: "10.0.0.4", status: "online", cpuUsage: 20, ramUsage: 25, diskUsage: 20, cpuCores: 8, memoryMb: 8192, usedMemoryMb: 2048, runningVmCount: 0, uptime: "2h", lastSeen: new Date().toISOString() },
];

describe("MPI provider and placement", () => {
  it("never selects offline nodes and completes mock jobs through lifecycle states", async () => {
    const provider = new MockMPIProvider({ listNodes: async () => nodes });
    const job = await provider.submitJob({ name: "Pi test", program: "calculate-pi", processCount: 2, nodeSelection: "automatic", userId: "u1", userName: "Member" });
    expect(job.nodesUsed).toEqual(["worker-b"]);
    expect(job.status).toBe("queued");
    await new Promise((resolve) => setTimeout(resolve, 1250));
    const completed = await provider.getJob(job.id);
    expect(completed?.status).toBe("completed");
    expect(completed?.executionTimeMs).toBeGreaterThan(0);
  });

  it("rejects invalid programs and impossible process allocations", async () => {
    const provider = new MockMPIProvider({ listNodes: async () => nodes });
    await expect(provider.submitJob({ name: "bad", program: "not-real" as never, processCount: 1, nodeSelection: "automatic", userId: "u1", userName: "Member" })).rejects.toThrow("INVALID_MPI_PROGRAM");
    await expect(provider.submitJob({ name: "too large", program: "matrix-multiply", processCount: 64, nodeSelection: "automatic", userId: "u1", userName: "Member" })).rejects.toThrow("INSUFFICIENT_MPI_NODES");
  });

  it("uses the least-loaded suitable mock VM host", async () => {
    const provider = new MockCloudProvider();
    const vm = await provider.createVM({ ownerId: "u1", ownerName: "Member", name: "placement-test", image: "Ubuntu 24.04 LTS", cpu: 1, memoryMb: 512, diskGb: 5, placement: "automatic" });
    expect(vm.host).toBe("node03");
  });
});
