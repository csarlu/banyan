import { useState, useEffect } from 'react'

export interface TerminalDimensions {
  columns: number
  rows: number
  isNarrow: boolean
}

export function getTerminalDimensions(): { columns: number; rows: number } {
  const columns =
    process.stderr.columns ||
    process.stdout.columns ||
    (typeof process.stdout.getWindowSize === 'function' ? process.stdout.getWindowSize()[0] : 80)
  const rows =
    process.stderr.rows ||
    process.stdout.rows ||
    (typeof process.stdout.getWindowSize === 'function' ? process.stdout.getWindowSize()[1] : 24)

  return {
    columns: Math.max(20, columns),
    rows: Math.max(10, rows),
  }
}

export function useTerminalDimensions(): TerminalDimensions {
  const [dimensions, setDimensions] = useState(() => getTerminalDimensions())

  useEffect(() => {
    const handleResize = () => {
      // Clear screen on terminal resize to wipe ghost characters / stale borders
      if (process.stderr.isTTY) {
        process.stderr.write('\x1b[2J\x1b[H')
      }
      const next = getTerminalDimensions()
      setDimensions(next)
    }

    if (process.stderr && typeof process.stderr.on === 'function') {
      process.stderr.on('resize', handleResize)
    }
    if (process.stdout && typeof process.stdout.on === 'function') {
      process.stdout.on('resize', handleResize)
    }

    return () => {
      if (process.stderr && typeof process.stderr.removeListener === 'function') {
        process.stderr.removeListener('resize', handleResize)
      }
      if (process.stdout && typeof process.stdout.removeListener === 'function') {
        process.stdout.removeListener('resize', handleResize)
      }
    }
  }, [])

  return {
    columns: dimensions.columns,
    rows: dimensions.rows,
    isNarrow: dimensions.columns < 105,
  }
}
