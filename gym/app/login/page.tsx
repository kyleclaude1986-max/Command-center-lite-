"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
      callbackUrl: "/",
    });
    setLoading(false);
    if (!res || res.error) {
      setError("Incorrect email or password.");
      return;
    }
    window.location.href = res.url ?? "/";
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="card card-pad w-full max-w-sm">
        <h1 className="text-2xl font-semibold mb-1">Gym</h1>
        <p className="text-sm text-ink-muted mb-6">Sign in to keep going.</p>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="field-label">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              className="field"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="password" className="field-label">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              className="field"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-sm text-state-miss">{error}</p>}
          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? "Signing in" : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}
