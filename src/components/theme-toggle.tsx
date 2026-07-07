"use client"

import * as React from "react"
import { Moon, Sun } from "lucide-react"

/**
 * Dark / light switch for the shell command bar.
 *
 * The actual `.dark` class is applied to <html> by the inline no-flash script
 * in the root layout before paint; this control just flips it and persists the
 * choice to localStorage. We read the initial state from the DOM after mount to
 * stay in sync with whatever that script decided (avoids a hydration mismatch).
 */
export function ThemeToggle() {
  const [isDark, setIsDark] = React.useState(false)
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
    setIsDark(document.documentElement.classList.contains("dark"))
  }, [])

  function toggle() {
    const next = !isDark
    setIsDark(next)
    const root = document.documentElement
    root.classList.toggle("dark", next)
    try {
      localStorage.setItem("theme", next ? "dark" : "light")
    } catch {
      /* storage unavailable — theme still applies for this session */
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={mounted && isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={mounted && isDark ? "Light mode" : "Dark mode"}
      className="relative flex h-8 w-8 items-center justify-center rounded-md text-chrome-foreground transition-colors hover:bg-chrome-hover hover:text-chrome-strong"
    >
      {/* Render both, cross-fade with opacity so there is no icon flash before mount */}
      <Sun className={`h-[18px] w-[18px] transition-all ${mounted && isDark ? "scale-100 opacity-100" : "absolute scale-0 opacity-0"}`} />
      <Moon className={`h-[18px] w-[18px] transition-all ${mounted && !isDark ? "scale-100 opacity-100" : "absolute scale-0 opacity-0"}`} />
    </button>
  )
}
