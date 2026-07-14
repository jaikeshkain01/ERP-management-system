"use client"

import * as React from "react"
import { KeyRound, Save, CheckCircle2, AlertCircle } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function ChangePasswordCard() {
  const [current, setCurrent] = React.useState("")
  const [next, setNext] = React.useState("")
  const [confirm, setConfirm] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [done, setDone] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  const submit = async () => {
    setError(null)
    setDone(false)
    if (!current) return setError("Enter your current password.")
    if (next.length < 8) return setError("New password must be at least 8 characters.")
    if (next !== confirm) return setError("New password and confirmation do not match.")
    if (next === current) return setError("New password must be different from the current one.")
    setBusy(true)
    try {
      const res = await fetch("/api/me/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error?.message || "Could not change password")
      setCurrent(""); setNext(""); setConfirm(""); setDone(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not change password")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="border border-border shadow-sm">
      <CardHeader className="border-b border-border bg-muted/20">
        <div className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-primary" />
          <div>
            <CardTitle className="text-lg font-bold">Change Password</CardTitle>
            <CardDescription>Update the password for your own account</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-6 space-y-4">
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Current Password</label>
          <Input type="password" autoComplete="current-password" value={current}
            onChange={(e) => { setCurrent(e.target.value); setDone(false); setError(null) }} placeholder="••••••••" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">New Password</label>
            <Input type="password" autoComplete="new-password" value={next}
              onChange={(e) => { setNext(e.target.value); setDone(false); setError(null) }} placeholder="At least 8 characters" />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Confirm New Password</label>
            <Input type="password" autoComplete="new-password" value={confirm}
              onChange={(e) => { setConfirm(e.target.value); setDone(false); setError(null) }} placeholder="Re-enter new password" />
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-xs font-medium text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0 mt-px" /> <span>{error}</span>
          </div>
        )}
        {done && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4 shrink-0" /> <span>Password changed. Use it next time you sign in.</span>
          </div>
        )}
      </CardContent>
      <CardFooter className="border-t border-border p-4 bg-muted/10 flex justify-end">
        <Button className="gap-2 font-semibold" onClick={submit} disabled={busy}>
          <Save className="h-4 w-4" />
          <span>{busy ? "Saving…" : "Update Password"}</span>
        </Button>
      </CardFooter>
    </Card>
  )
}
