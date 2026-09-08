import { z } from "zod";

export const APP_NAME = "HPC Cloud";
export const registrationSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.email().max(254),
  password: z.string().min(12).max(128),
});
export const loginSchema = registrationSchema.omit({ name: true });
export type Role = "admin" | "member";
export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: string;
}
export interface ApiError {
  error: { code: string; message: string };
}

export const vmCreateSchema = z.object({
  name: z.string().trim().min(2).max(60).regex(/^[a-zA-Z0-9][a-zA-Z0-9-_ ]*$/),
  image: z.enum(["Ubuntu 24.04 LTS", "Rocky Linux 9", "Debian 12"]),
  cpu: z.union([z.literal(1), z.literal(2), z.literal(4)]),
  memoryMb: z.union([z.literal(512), z.literal(1024), z.literal(2048), z.literal(4096)]),
  diskGb: z.union([z.literal(5), z.literal(10), z.literal(20)]),
});

export type VmStatus = "pending" | "running" | "stopped" | "error" | "deleting" | "unknown";
export type NodeStatus = "online" | "offline" | "unknown";
export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface VirtualMachine {
  id: string;
  externalId: string;
  ownerId: string;
  ownerName: string;
  name: string;
  provider: "mock" | "opennebula";
  status: VmStatus;
  cpu: number;
  memoryMb: number;
  diskGb: number;
  image: string;
  host: string | null;
  ipAddress: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClusterNode {
  id: string;
  hostname: string;
  ipAddress: string;
  status: NodeStatus;
  cpuUsage: number;
  ramUsage: number;
  diskUsage: number;
  cpuCores: number;
  memoryMb: number;
  uptime: string;
  lastSeen: string;
}

export interface CloudAccount {
  id: string;
  userId: string;
  provider: "mock" | "opennebula";
  externalUserId: string | null;
  username: string | null;
  status: "not_provisioned" | "provisioning" | "active" | "failed";
  createdAt: string;
  updatedAt: string;
}

export interface CloudUser {
  id: string;
  username: string;
  name: string;
  status: "active" | "disabled";
}

export interface MemberDirectoryEntry extends CurrentUser {
  cloudAccountStatus: CloudAccount["status"];
}

export interface ActivityLog {
  id: string;
  userId: string | null;
  userName: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata: Record<string, string | number | boolean>;
  createdAt: string;
}

export interface MpiJob {
  id: string;
  userId: string;
  userName: string;
  name: string;
  program: "matrix-multiply" | "calculate-pi" | "vector-addition";
  processCount: number;
  status: JobStatus;
  output: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}
