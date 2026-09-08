"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Layers3, ShieldCheck } from "lucide-react";
import { APP_NAME, loginSchema, registrationSchema } from "@hpc/shared";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const register = mode === "register";
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const fields = {
      name: String(form.get("name") || ""),
      email: String(form.get("email") || ""),
      password: String(form.get("password") || ""),
    };
    const parsed = (register ? registrationSchema : loginSchema).safeParse(
      fields,
    );
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || "Please check the form.");
      return;
    }
    setBusy(true);
    try {
      const result = register
        ? await authClient.signUp.email(fields)
        : await authClient.signIn.email({
            email: fields.email,
            password: fields.password,
          });
      if (result.error) {
        setError(
          result.error.message || "Unable to sign in. Please try again.",
        );
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("Cannot reach the account service. Please try again shortly.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-layout">
      <aside className="auth-aside">
        <div className="brand">
          <Layers3 size={29} />
          <span>{APP_NAME}</span>
        </div>
        <div className="aside-copy">
          <span className="eyebrow">UNIVERSITY COMPUTING</span>
          <h1>
            Your research.
            <br />
            More possibility.
          </h1>
          <p>A shared workspace for your Beowulf cluster.</p>
          <div className="cluster-map" aria-hidden="true">
            <span>MASTER</span>
            <div>
              <i>01</i>
              <i>02</i>
              <i>03</i>
            </div>
          </div>
        </div>
        <div className="aside-footer">
          <ShieldCheck size={17} /> Your individual account. A shared research
          community.
        </div>
      </aside>
      <section className="auth-main">
        <div className="mobile-brand">
          <Layers3 />
          {APP_NAME}
        </div>
        <div className="auth-card">
          <span className="eyebrow">MEMBER ACCESS</span>
          <h2>{register ? "Create your account" : "Welcome back"}</h2>
          <p className="muted">
            {register
              ? "Join your university computing workspace."
              : "Sign in to your computing workspace."}
          </p>
          <form onSubmit={submit} className="auth-form">
            {register && (
              <label htmlFor="name">
                Full name
                <Input
                  id="name"
                  name="name"
                  autoComplete="name"
                  placeholder="Your name"
                  minLength={2}
                  maxLength={100}
                  required
                  disabled={busy}
                />
              </label>
            )}
            <label htmlFor="email">
              Email address
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@university.ac.za"
                maxLength={254}
                required
                disabled={busy}
              />
            </label>
            <label htmlFor="password">
              Password
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete={register ? "new-password" : "current-password"}
                minLength={12}
                maxLength={128}
                required
                disabled={busy}
                aria-describedby={register ? "password-help" : undefined}
              />
            </label>
            {register && (
              <p id="password-help" className="field-help">
                Use at least 12 characters.
              </p>
            )}
            {error && (
              <div role="alert" className="error-box">
                {error}
              </div>
            )}
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "Please wait…" : register ? "Create account" : "Sign in"}
              {!busy && <ArrowRight size={17} />}
            </Button>
          </form>
          <p className="switch-auth">
            {register ? "Already have an account?" : "New to the workspace?"}{" "}
            <Link href={register ? "/login" : "/register"}>
              {register ? "Sign in" : "Create an account"}
            </Link>
          </p>
        </div>
        <footer className="auth-footer">
          Beowulf Cluster Project <span>Research starts here.</span>
        </footer>
      </section>
    </main>
  );
}
