import { Launchpad } from "@/components/launchpad"

export default function HomePage() {
  return (
    <div className="mx-auto max-w-6xl space-y-7">
      <div className="flex flex-col gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
          Enterprise Suite
        </span>
        <h1 className="text-[26px] font-bold leading-tight tracking-tight text-foreground md:text-3xl">
          Operations Control Center
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Select a workspace to begin. Modules not included in your current license plan are locked.
        </p>
      </div>

      <Launchpad />
    </div>
  )
}
