"use client"

import * as React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Shield, User, KeyRound, ChevronRight } from "lucide-react"
import { ChangePasswordCard } from "@/components/change-password-card"
import { useData } from "@/lib/data-provider"

type SettingsTab = "profile" | "password"

const TABS: { id: SettingsTab; label: string; icon: React.ComponentType<{ className?: string }>; description: string }[] = [
  { id: "profile",  label: "Profile",  icon: User,      description: "Your personal information" },
  { id: "password", label: "Password", icon: KeyRound,  description: "Update your password" },
]

export default function SettingsPage() {
  const [activeTab, setActiveTab] = React.useState<SettingsTab>("profile")
  const { me } = useData()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <span>Settings</span>
          <span>/</span>
          <span className="text-foreground font-medium">Account Settings</span>
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          View your profile and security details.
        </p>
      </div>

      {/* Settings layout */}
      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        {/* Sidebar navigation */}
        <Card className="border border-border shadow-sm h-fit lg:sticky lg:top-20">
          <CardHeader className="border-b border-border bg-muted/20 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-sm">
                {me?.user.name ? me.user.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) : "??"}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-foreground truncate">{me?.user.name ?? "—"}</p>
                <p className="text-xs text-muted-foreground truncate">{me?.user.email ?? "—"}</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-1.5">
            <nav className="flex flex-col gap-0.5">
              {TABS.map((tab) => {
                const Icon = tab.icon
                const active = activeTab === tab.id
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`group flex items-center gap-3 rounded-md px-3 py-2.5 text-left transition-all duration-150 ${
                      active
                        ? "bg-primary/10 text-primary font-semibold"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                    }`}
                  >
                    <Icon className={`h-4 w-4 shrink-0 transition-colors ${active ? "text-primary" : "text-muted-foreground/70 group-hover:text-foreground"}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-tight">{tab.label}</p>
                    </div>
                    <ChevronRight className={`h-3.5 w-3.5 shrink-0 transition-all duration-150 ${
                      active ? "opacity-100 text-primary" : "opacity-0 group-hover:opacity-50"
                    }`} />
                  </button>
                )
              })}
            </nav>
          </CardContent>
        </Card>

        {/* Content area */}
        <div className="space-y-6 min-w-0">
          {activeTab === "profile" && <ProfileTab />}
          {activeTab === "password" && <ChangePasswordCard />}
        </div>
      </div>
    </div>
  )
}

/* ──────────────────── Profile Tab ──────────────────── */

function ProfileTab() {
  const { me } = useData()
  const name = me?.user.name ?? ""
  const email = me?.user.email ?? ""

  return (
    <div className="space-y-6">
      <Card className="border border-border shadow-sm">
        <CardHeader className="border-b border-border bg-muted/20">
          <div className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-lg font-bold">Personal Information</CardTitle>
              <CardDescription>Your registered account details</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6 space-y-5">
          {/* Avatar preview */}
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xl ring-2 ring-primary/20">
              {name ? name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) : "??"}
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{name}</p>
              <p className="text-xs text-muted-foreground">{me?.company?.name ?? "—"}</p>
              <div className="mt-1.5 flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                  <Shield className="h-3 w-3" />
                  {me?.user.is_superadmin ? "Superadmin" : "User"}
                </span>
              </div>
            </div>
          </div>

          <div className="h-px bg-border" />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Full Name</label>
              <Input value={name} readOnly className="border-input bg-muted/30 cursor-not-allowed" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Email Address</label>
              <Input type="email" value={email} readOnly className="border-input bg-muted/30 cursor-not-allowed" />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Company</label>
              <Input value={me?.company?.name ?? "—"} readOnly className="border-input bg-muted/30 cursor-not-allowed" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Company Code</label>
              <Input value={me?.company?.code ?? "—"} readOnly className="border-input bg-muted/30 cursor-not-allowed" />
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground/80 block">
            To update your profile information, contact your administrator.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
