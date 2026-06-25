import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Settings, Save, Shield, HelpCircle, Bell } from "lucide-react"

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <span>Settings</span>
          <span>/</span>
          <span className="text-foreground font-medium">System Configuration</span>
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Manage system-wide configuration defaults, safety alert thresholds, and authentication parameters.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Left Side: General Profile Preference */}
        <Card className="border border-border shadow-sm">
          <CardHeader className="border-b border-border bg-muted/20">
            <div className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-lg font-bold">General Settings</CardTitle>
                <CardDescription>Configure global default preferences</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">System Name</label>
              <Input defaultValue="StackIOT Technologies Pvt. Ltd." className="border-input bg-background" />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Notification Email</label>
              <Input type="email" defaultValue="jaikesh@example.com" className="border-input bg-background" />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Default Currency</label>
              <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring">
                <option value="usd">USD ($)</option>
                <option value="eur">EUR (€)</option>
                <option value="inr">INR (₹)</option>
              </select>
            </div>
          </CardContent>
          <CardFooter className="border-t border-border p-4 bg-muted/10 flex justify-end">
            <Button className="gap-2 font-semibold">
              <Save className="h-4 w-4" />
              <span>Save General</span>
            </Button>
          </CardFooter>
        </Card>

        {/* Right Side: Alerts and Access Controls */}
        <div className="space-y-6">
          {/* Notifications Card */}
          <Card className="border border-border shadow-sm">
            <CardHeader className="border-b border-border bg-muted/20">
              <div className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle className="text-lg font-bold">Inventory Alerts</CardTitle>
                  <CardDescription>Manage safety stock threshold limits</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Low Stock Buffer (%)</label>
                <Input type="number" defaultValue="20" className="border-input bg-background" />
                <span className="text-[10px] text-muted-foreground/80 block mt-1">Alerts trigger when stock levels fall below this percentage of minimum threshold.</span>
              </div>
            </CardContent>
            <CardFooter className="border-t border-border p-4 bg-muted/10 flex justify-end">
              <Button className="gap-2 font-semibold">
                <Save className="h-4 w-4" />
                <span>Save Alerts</span>
              </Button>
            </CardFooter>
          </Card>

          {/* Roles Card */}
          <Card className="border border-border shadow-sm">
            <CardHeader className="border-b border-border bg-muted/20">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle className="text-lg font-bold">Access Permissions</CardTitle>
                  <CardDescription>Configure user group security profiles</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-foreground">Current Profile:</span>
                  <span className="text-xs uppercase font-extrabold text-primary bg-primary/10 px-2 py-0.5 rounded">Manager</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed mt-2">
                  Manager status enables access control changes, BOM approvals, purchase order dispatches, and structural catalog locks.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
