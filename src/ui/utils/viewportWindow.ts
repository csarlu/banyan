export interface VisibleWindowResult<T> {
  visibleItems: T[]
  startIndex: number
  endIndex: number
  total: number
  hasMoreAbove: boolean
  hasMoreBelow: boolean
}

/**
 * Computes a virtualized sliding window around selectedIndex so that
 * the rendered list never exceeds maxVisibleRows in the terminal viewport.
 */
export function computeVisibleWindow<T>(
  items: T[],
  selectedIndex: number,
  maxVisibleRows: number,
): VisibleWindowResult<T> {
  const total = items.length
  if (total === 0) {
    return {
      visibleItems: [],
      startIndex: 0,
      endIndex: 0,
      total: 0,
      hasMoreAbove: false,
      hasMoreBelow: false,
    }
  }

  const limit = Math.max(1, Math.min(maxVisibleRows, total))
  if (total <= limit) {
    return {
      visibleItems: items,
      startIndex: 0,
      endIndex: total,
      total,
      hasMoreAbove: false,
      hasMoreBelow: false,
    }
  }

  const clampedSelected = Math.max(0, Math.min(selectedIndex, total - 1))
  const half = Math.floor(limit / 2)
  let startIndex = clampedSelected - half

  if (startIndex < 0) {
    startIndex = 0
  } else if (startIndex + limit > total) {
    startIndex = Math.max(0, total - limit)
  }

  const endIndex = Math.min(total, startIndex + limit)

  return {
    visibleItems: items.slice(startIndex, endIndex),
    startIndex,
    endIndex,
    total,
    hasMoreAbove: startIndex > 0,
    hasMoreBelow: endIndex < total,
  }
}
