import { Launchpad } from "@/components/launchpad"

export default function HomePage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
          Welcome to StackIOT Enterprise Suite
        </h1>
        <p className="text-muted-foreground text-sm md:text-base">
          Choose a workspace to get started. Locked modules are not part of your current plan.
        </p>
      </div>

      <Launchpad />
    </div>
  )
}
