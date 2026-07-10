"use client"

import * as React from "react"
import { useDragScroll } from "@/hooks/use-drag-scroll"

interface DragScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

/**
 * A wrapper that enables click-and-drag horizontal scrolling.
 * Drop-in replacement for `<div className="overflow-x-auto">`.
 *
 * Usage:
 *   <DragScrollArea className="overflow-x-auto">
 *     <table>…</table>
 *   </DragScrollArea>
 */
export function DragScrollArea({ children, className = "", ...rest }: DragScrollAreaProps) {
  const ref = useDragScroll<HTMLDivElement>()
  return (
    <div ref={ref} className={`cursor-grab ${className}`} {...rest}>
      {children}
    </div>
  )
}
