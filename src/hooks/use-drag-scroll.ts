import * as React from "react"

/**
 * Enables click-and-drag horizontal scrolling on a scrollable container.
 * Attach the returned ref to the `overflow-x-auto` wrapper element.
 *
 * A short press-and-release is left alone so it still counts as a click
 * (e.g. a row's `onClick`). Once the pointer moves past `DRAG_THRESHOLD`,
 * the gesture becomes a drag: the container pans and the trailing `click`
 * event is swallowed so interactive children don't fire on drag-release.
 *
 * Usage:
 *   const scrollRef = useDragScroll()
 *   <div ref={scrollRef} className="overflow-x-auto">…</div>
 */
const DRAG_THRESHOLD = 6 // px of movement before a press becomes a drag

export function useDragScroll<T extends HTMLElement = HTMLDivElement>() {
  const ref = React.useRef<T>(null)

  React.useEffect(() => {
    const el = ref.current
    if (!el) return

    let isDown = false
    let dragged = false
    let startX = 0
    let scrollLeft = 0

    const endDrag = () => {
      if (!isDown) return
      isDown = false
      el.style.cursor = ""
      el.style.userSelect = ""
    }

    const onMouseDown = (e: MouseEvent) => {
      // Only react to primary (left) button.
      if (e.button !== 0) return
      isDown = true
      dragged = false
      startX = e.pageX - el.offsetLeft
      scrollLeft = el.scrollLeft
    }

    const onMouseMove = (e: MouseEvent) => {
      if (!isDown) return
      const x = e.pageX - el.offsetLeft
      const walk = (x - startX) * 1.5 // multiplier for scroll speed
      if (!dragged && Math.abs(x - startX) > DRAG_THRESHOLD) {
        // Cross the threshold → commit to a drag gesture.
        dragged = true
        el.style.cursor = "grabbing"
        el.style.userSelect = "none"
      }
      if (dragged) {
        e.preventDefault()
        el.scrollLeft = scrollLeft - walk
      }
    }

    // Capture-phase click swallower: when the press turned into a drag, cancel
    // the synthetic click so a row/link inside the container doesn't activate.
    const onClickCapture = (e: MouseEvent) => {
      if (dragged) {
        e.stopPropagation()
        e.preventDefault()
        dragged = false
      }
    }

    // End the drag even when the pointer is released outside the element.
    const onWindowMouseUp = () => endDrag()

    el.addEventListener("mousedown", onMouseDown)
    el.addEventListener("mousemove", onMouseMove)
    el.addEventListener("click", onClickCapture, true)
    window.addEventListener("mouseup", onWindowMouseUp)

    return () => {
      el.removeEventListener("mousedown", onMouseDown)
      el.removeEventListener("mousemove", onMouseMove)
      el.removeEventListener("click", onClickCapture, true)
      window.removeEventListener("mouseup", onWindowMouseUp)
    }
  }, [])

  return ref
}
