"use client"

import * as React from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { LogIn, Loader2, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useData } from "@/lib/data-provider"

export default function LoginPage() {
  const router = useRouter()
  const { reload, authState } = useData()
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  // Finish sign-in: refresh the session-backed data, then enter the app.
  const enterApp = async () => {
    await reload()
    router.replace("/")
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password) return setError("Enter your email and password.")
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error?.message || "Sign-in failed")
      await enterApp()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed")
      setBusy(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
      {/* Subtle industrial backdrop */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,color-mix(in_oklch,var(--primary),transparent_88%),transparent_60%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-chrome" />

      <div className="relative w-full max-w-sm">
        {/* Brand */}
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-white/95 shadow-md ring-1 ring-black/5 overflow-hidden">
            <Image src="/images/logo-square.png" alt="StackIOT" width={100} height={100} className="object-contain p-1" />
          </div>
          <div>
            <p className="text-base font-bold tracking-tight text-foreground">StackIOT Technologies</p>
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Enterprise Suite</p>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="mb-5">
            <h1 className="text-lg font-bold tracking-tight">Sign in</h1>
            <p className="text-xs text-muted-foreground">Use your account credentials to access the suite.</p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Email</label>
              <Input id="email" type="email" autoComplete="username" autoFocus value={email}
                onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" disabled={busy} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="password" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Password</label>
              <Input id="password" type="password" autoComplete="current-password" value={password}
                onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" disabled={busy} />
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-xs font-medium text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0 mt-px" />
                <span>{error}</span>
              </div>
            )}

            <Button type="submit" size="lg" className="w-full gap-2 font-semibold" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-[11px] text-muted-foreground/70">
          {authState === "loading" ? "Checking session…" : "Protected system · authorised access only"}
        </p>
      </div>
    </div>
  )
}
