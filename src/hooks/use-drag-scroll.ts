import * as React from "react"

/**
 * Enables click-and-drag horizontal scrolling on a scrollable container.
 * Attach the returned ref to the `overflow-x-auto` wrapper element.
 *
 * Usage:
 *   const scrollRef = useDragScroll()
 *   <div ref={scrollRef} className="overflow-x-auto">…</div>
 */
export function useDragScroll<T extends HTMLElement = HTMLDivElement>() {
  const ref = React.useRef<T>(null)

  React.useEffect(() => {
    const el = ref.current
    if (!el) return

    let isDown = false
    let startX = 0
    let scrollLeft = 0

    const onMouseDown = (e: MouseEvent) => {
      // Only react to primary (left) button
      if (e.button !== 0) return
      isDown = true
      el.style.cursor = "grabbing"
      el.style.userSelect = "none"
      startX = e.pageX - el.offsetLeft
      scrollLeft = el.scrollLeft
    }

    const onMouseLeave = () => {
      if (!isDown) return
      isDown = false
      el.style.cursor = ""
      el.style.userSelect = ""
    }

    const onMouseUp = () => {
      if (!isDown) return
      isDown = false
      el.style.cursor = ""
      el.style.userSelect = ""
    }

    const onMouseMove = (e: MouseEvent) => {
      if (!isDown) return
      e.preventDefault()
      const x = e.pageX - el.offsetLeft
      const walk = (x - startX) * 1.5 // multiplier for scroll speed
      el.scrollLeft = scrollLeft - walk
    }

    el.addEventListener("mousedown", onMouseDown)
    el.addEventListener("mouseleave", onMouseLeave)
    el.addEventListener("mouseup", onMouseUp)
    el.addEventListener("mousemove", onMouseMove)

    return () => {
      el.removeEventListener("mousedown", onMouseDown)
      el.removeEventListener("mouseleave", onMouseLeave)
      el.removeEventListener("mouseup", onMouseUp)
      el.removeEventListener("mousemove", onMouseMove)
    }
  }, [])

  return ref
}
