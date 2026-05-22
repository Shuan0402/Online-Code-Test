/**
 * Tests for ExamTimer component.
 *
 * ExamTimer:
 *   - Accepts `initialSeconds` (number) and `onTimeout` (function) props.
 *   - Displays remaining time as MM:SS.
 *   - Applies warning style (text-red-600 animate-pulse) when remaining < 300s.
 *   - Calls `onTimeout` exactly once when the countdown reaches zero.
 *   - Uses a single setInterval (not one per tick).
 */

import { render, screen, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import ExamTimer from './ExamTimer'

describe('ExamTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('displays initial time as MM:SS without counting down before first tick', () => {
    render(<ExamTimer initialSeconds={3661} onTimeout={vi.fn()} />)
    // 3661s = 61 min 1s → "61:01"
    expect(screen.getByText(/61:01/)).toBeInTheDocument()
  })

  it('counts down by 1 second on each interval tick', () => {
    render(<ExamTimer initialSeconds={10} onTimeout={vi.fn()} />)
    expect(screen.getByText(/00:10/)).toBeInTheDocument()

    act(() => { vi.advanceTimersByTime(1000) })
    expect(screen.getByText(/00:09/)).toBeInTheDocument()

    act(() => { vi.advanceTimersByTime(1000) })
    expect(screen.getByText(/00:08/)).toBeInTheDocument()
  })

  it('formats MM:SS correctly — pads both minutes and seconds to 2 digits', () => {
    render(<ExamTimer initialSeconds={65} onTimeout={vi.fn()} />)
    // 65s = 1 min 5s → "01:05"
    expect(screen.getByText(/01:05/)).toBeInTheDocument()
  })

  it('applies warning style when remaining < 5 minutes (300 s)', () => {
    // Start at exactly 300 — NOT in warning zone yet (300 is not < 300)
    const { container } = render(<ExamTimer initialSeconds={300} onTimeout={vi.fn()} />)
    let timerEl = container.querySelector('[aria-label]')
    expect(timerEl.className).not.toMatch(/text-red-600/)

    // Tick once → 299s, which IS < 300 → warning
    act(() => { vi.advanceTimersByTime(1000) })
    timerEl = container.querySelector('[aria-label]')
    expect(timerEl.className).toMatch(/text-red-600/)
    expect(timerEl.className).toMatch(/animate-pulse/)
  })

  it('calls onTimeout exactly once when countdown reaches zero', () => {
    const onTimeout = vi.fn()
    render(<ExamTimer initialSeconds={3} onTimeout={onTimeout} />)

    act(() => { vi.advanceTimersByTime(1000) }) // 2s
    act(() => { vi.advanceTimersByTime(1000) }) // 1s
    act(() => { vi.advanceTimersByTime(1000) }) // 0s → fires

    expect(onTimeout).toHaveBeenCalledTimes(1)

    // More ticks — should not fire again
    act(() => { vi.advanceTimersByTime(5000) })
    expect(onTimeout).toHaveBeenCalledTimes(1)
  })

  it('displays 00:00 when countdown reaches zero', () => {
    render(<ExamTimer initialSeconds={2} onTimeout={vi.fn()} />)
    act(() => { vi.advanceTimersByTime(2000) })
    expect(screen.getByText(/00:00/)).toBeInTheDocument()
  })

  it('resets countdown when initialSeconds prop changes', () => {
    const { rerender } = render(<ExamTimer initialSeconds={10} onTimeout={vi.fn()} />)

    act(() => { vi.advanceTimersByTime(3000) }) // 7s left
    expect(screen.getByText(/00:07/)).toBeInTheDocument()

    // New initialSeconds from parent (e.g., server refresh)
    rerender(<ExamTimer initialSeconds={60} onTimeout={vi.fn()} />)
    expect(screen.getByText(/01:00/)).toBeInTheDocument()
  })
})
