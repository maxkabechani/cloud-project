import { describe, expect, it, afterAll } from "bun:test";
import { createAgentApp } from "../apps/cluster-agent/src/app";

const key = "local-agent-test-key-012345678901234567890";
const app = createAgentApp({ CLUSTER_AGENT_API_KEY: key });

afterAll(async () => { await app.close(); });

describe("cluster agent control plane", () => {
  it("keeps health public and infrastructure routes authenticated", async () => {
    const health = await app.inject({ method: "GET", url: "/health" });
    expect(health.statusCode).toBe(200);
    const denied = await app.inject({ method: "GET", url: "/cluster/status" });
    expect(denied.statusCode).toBe(401);
    const wrong = await app.inject({ method: "GET", url: "/cluster/status", headers: { authorization: "Bearer wrong-key" } });
    expect(wrong.statusCode).toBe(401);
  });

  it("supports controlled VM lifecycle operations without shell access", async () => {
    const headers = { authorization: `Bearer ${key}` };
    const created = await app.inject({ method: "POST", url: "/cloud/vms", headers, payload: { name: "agent-vm", image: "Ubuntu 24.04 LTS", cpu: 2, memoryMb: 2048, diskGb: 10 } });
    expect(created.statusCode).toBe(201);
    const vm = created.json();
    expect(vm.status).toBe("running");
    const stopped = await app.inject({ method: "POST", url: `/cloud/vms/${vm.id}/stop`, headers });
    expect(stopped.statusCode).toBe(200);
    expect(stopped.json().status).toBe("stopped");
    const shell = await app.inject({ method: "POST", url: "/shell", headers, payload: { command: "whoami" } });
    expect(shell.statusCode).toBe(404);
  });

  it("validates and provisions controlled cloud users", async () => {
    const headers = { authorization: `Bearer ${key}` };
    const invalid = await app.inject({ method: "POST", url: "/cloud/users", headers, payload: { username: "bad name", name: "A" } });
    expect(invalid.statusCode).toBe(400);
    const created = await app.inject({ method: "POST", url: "/cloud/users", headers, payload: { username: "researcher-1", name: "Research Member" } });
    expect(created.statusCode).toBe(201);
    expect(created.json().status).toBe("active");
  });

  it("exposes only approved MPI programs and rejects unsafe input", async () => {
    const headers = { authorization: `Bearer ${key}` };
    const programs = await app.inject({ method: "GET", url: "/mpi/programs", headers });
    expect(programs.statusCode).toBe(200);
    expect(programs.json().programs.map((program: { id: string }) => program.id)).toEqual(["calculate-pi", "matrix-multiply", "vector-addition"]);
    const unsafe = await app.inject({ method: "POST", url: "/mpi/jobs", headers, payload: { name: "unsafe", program: "/tmp/run.sh", processCount: 2, command: "whoami" } });
    expect(unsafe.statusCode).toBe(400);
    const valid = await app.inject({ method: "POST", url: "/mpi/jobs", headers, payload: { name: "matrix test", program: "matrix-multiply", processCount: 2 } });
    expect(valid.statusCode).toBe(201);
    expect(valid.json().status).toBe("queued");
    const cancelled = await app.inject({ method: "POST", url: `/mpi/jobs/${valid.json().id}/cancel`, headers });
    expect(cancelled.statusCode).toBe(204);
  });
});
