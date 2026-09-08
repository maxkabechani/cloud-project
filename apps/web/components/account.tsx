"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Layers3,
  LogOut,
  UserRound,
  ShieldCheck,
  ArrowUpRight,
} from "lucide-react";
import { APP_NAME, type CurrentUser } from "@hpc/shared";
import { API_URL, authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
class AccountError extends Error {
  constructor(public status: number) {
    super("Unable to load your account.");
  }
}
export function Account() {
  const router = useRouter();
  const client = useQueryClient();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");
  const query = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const response = await fetch(API_URL + "/api/me", {
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) throw new AccountError(response.status);
      return (await response.json()) as { user: CurrentUser };
    },
    retry: (count, error) =>
      !(error instanceof AccountError && error.status === 401) && count < 1,
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
  });
  const unauthorized =
    query.error instanceof AccountError && query.error.status === 401;
  useEffect(() => {
    if (unauthorized) router.replace("/login");
  }, [unauthorized, router]);
  async function logout() {
    setSigningOut(true);
    setError("");
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error();
      client.clear();
      router.replace("/login");
      router.refresh();
    } catch {
      setError("Could not sign out. Please try again.");
    } finally {
      setSigningOut(false);
    }
  }
  if (query.isPending || unauthorized)
    return (
      <main className="state-screen" role="status">
        <Layers3 size={36} />
        <p>Opening your workspace…</p>
      </main>
    );
  if (query.isError)
    return (
      <main className="state-screen">
        <h1>Account service unavailable</h1>
        <p>Your account could not be loaded. Please try again.</p>
        <Button onClick={() => void query.refetch()}>Try again</Button>
      </main>
    );
  const user = query.data.user;
  return (
    <div className="workspace">
      <aside className="workspace-sidebar">
        <div className="brand">
          <Layers3 size={26} />
          {APP_NAME}
        </div>
        <span className="eyebrow">WORKSPACE</span>
        <a href="/dashboard" className="nav-active">
          <UserRound size={19} />
          My account
        </a>
        <div className="sidebar-bottom">
          Beowulf Cluster Project
          <br />
          <span>University computing</span>
        </div>
      </aside>
      <div className="workspace-body">
        <header className="workspace-header">
          <span>
            Workspace <span className="slash">/</span> My account
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={logout}
            disabled={signingOut}
          >
            <LogOut size={15} />
            {signingOut ? "Signing out…" : "Sign out"}
          </Button>
        </header>
        <main className="account-content">
          <span className="eyebrow">YOUR WORKSPACE</span>
          <h1>Welcome, {user.name.split(" ")[0]}.</h1>
          <p className="muted">Your university computing account is ready.</p>
          {error && (
            <p className="error-box" role="alert">
              {error}
            </p>
          )}
          <section className="profile-card">
            <div className="profile-heading">
              <div className="avatar">
                {user.name.slice(0, 1).toUpperCase()}
              </div>
              <div>
                <h2>{user.name}</h2>
                <p className="muted">{user.email}</p>
              </div>
              <span className="role-badge">{user.role}</span>
            </div>
            <dl className="profile-details">
              <div>
                <dt>Account status</dt>
                <dd>
                  <span className="status-dot" />
                  Active
                </dd>
              </div>
              <div>
                <dt>Joined</dt>
                <dd>
                  {new Date(user.createdAt).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </dd>
              </div>
              <div>
                <dt>Workspace</dt>
                <dd>Beowulf Cluster</dd>
              </div>
            </dl>
          </section>
          <section className="notice-card">
            <ShieldCheck size={24} />
            <div>
              <h2>You’re securely signed in</h2>
              <p>
                Your account works independently of the physical cluster. VM
                management and cluster monitoring will be added in the next
                project phases.
              </p>
            </div>
            <ArrowUpRight size={20} />
          </section>
        </main>
      </div>
    </div>
  );
}
