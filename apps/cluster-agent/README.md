# Cluster Agent

The cluster agent is the only service that is allowed to hold OpenNebula credentials. It exposes a small, authenticated control plane for the API: cluster status, nodes, cloud users, virtual machines, and approved MPI jobs. It deliberately has no arbitrary shell or command execution endpoint.

Run locally with `bun run --filter @hpc/cluster-agent dev`. Set `CLUSTER_AGENT_API_KEY` to a random value of at least 32 characters. `OPENNEBULA_ENDPOINT` and `OPENNEBULA_USERNAME`/`OPENNEBULA_PASSWORD` are reserved for the provider adapter; the local agent uses the safe in-memory provider until those credentials are configured.
