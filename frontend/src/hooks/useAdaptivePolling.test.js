/**
 * Tests for useAdaptivePolling.
 *
 * The hook uses setTimeout chains:
 *   - First poll fires after POLLING_DELAYS[0] = 300 ms
 *   - Each subsequent poll fires after the next delay in the array
 *   - When the array is exhausted, it stays on POLLING_DELAYS[8] = 10000 ms
 *   - Polling stops immediately when status is terminal (not Pending/Judging)
 *
 * We mock @/lib/api so no real network calls are made.
 */

import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { useAdaptivePolling } from './useAdaptivePolling'

// Mock @/lib/api — default export is the axios instance.
vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn(),
  },
}))

// Import the mock so we can configure per-test responses.
import api from '@/lib/api'

const POLLING_DELAYS = [300, 500, 1000, 2000, 3000, 5000, 5000, 5000, 10000]

describe('useAdaptivePolling', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('fires the first poll after POLLING_DELAYS[0] = 300 ms', async () => {
    api.get.mockResolvedValue({ data: { id: 'sub-1', status: 'Pending' } })
    const onResult = vi.fn()

    renderHook(() => useAdaptivePolling('sub-1', onResult))

    // Nothing yet — timer hasn't fired
    expect(api.get).not.toHaveBeenCalled()

    // Advance just past the first delay
    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    expect(api.get).toHaveBeenCalledTimes(1)
    expect(api.get).toHaveBeenCalledWith('/api/v1/submissions/sub-1')
    expect(onResult).toHaveBeenCalledTimes(1)
    expect(onResult).toHaveBeenCalledWith({ id: 'sub-1', status: 'Pending' })
  })

  it('consumes delay array in order then cycles on the last value', async () => {
    // Always returns non-terminal Pending so polling keeps going
    api.get.mockResolvedValue({ data: { id: 'sub-2', status: 'Pending' } })
    const onResult = vi.fn()

    renderHook(() => useAdaptivePolling('sub-2', onResult))

    // Each poll is async: fire timer → await api.get → schedule next timer.
    // We must advance the timer AND flush Promises between each poll.
    // Strategy: advance by each delay, then flush microtasks.

    // Poll 1: starts at POLLING_DELAYS[0] = 300ms
    await act(async () => {
      vi.advanceTimersByTime(POLLING_DELAYS[0])
    })
    expect(api.get).toHaveBeenCalledTimes(1)

    // Poll 2: next delay = POLLING_DELAYS[1] = 500ms
    await act(async () => {
      vi.advanceTimersByTime(POLLING_DELAYS[1])
    })
    expect(api.get).toHaveBeenCalledTimes(2)

    // Poll 3: POLLING_DELAYS[2] = 1000ms
    await act(async () => {
      vi.advanceTimersByTime(POLLING_DELAYS[2])
    })
    expect(api.get).toHaveBeenCalledTimes(3)

    // Poll 4: POLLING_DELAYS[3] = 2000ms
    await act(async () => {
      vi.advanceTimersByTime(POLLING_DELAYS[3])
    })
    expect(api.get).toHaveBeenCalledTimes(4)

    // Poll 5: POLLING_DELAYS[4] = 3000ms
    await act(async () => {
      vi.advanceTimersByTime(POLLING_DELAYS[4])
    })
    expect(api.get).toHaveBeenCalledTimes(5)

    // Poll 6: POLLING_DELAYS[5] = 5000ms
    await act(async () => {
      vi.advanceTimersByTime(POLLING_DELAYS[5])
    })
    expect(api.get).toHaveBeenCalledTimes(6)

    // Poll 7: POLLING_DELAYS[6] = 5000ms
    await act(async () => {
      vi.advanceTimersByTime(POLLING_DELAYS[6])
    })
    expect(api.get).toHaveBeenCalledTimes(7)

    // Poll 8: POLLING_DELAYS[7] = 5000ms
    await act(async () => {
      vi.advanceTimersByTime(POLLING_DELAYS[7])
    })
    expect(api.get).toHaveBeenCalledTimes(8)

    // Poll 9: POLLING_DELAYS[8] = 10000ms (last entry)
    await act(async () => {
      vi.advanceTimersByTime(POLLING_DELAYS[8])
    })
    expect(api.get).toHaveBeenCalledTimes(9)

    // Poll 10: should use POLLING_DELAYS[8] = 10000ms again (cycles on last)
    await act(async () => {
      vi.advanceTimersByTime(POLLING_DELAYS[8])
    })
    expect(api.get).toHaveBeenCalledTimes(10)
  })

  it('stops polling when terminal status is received', async () => {
    api.get.mockResolvedValue({ data: { id: 'sub-3', status: 'AC' } })
    const onResult = vi.fn()

    renderHook(() => useAdaptivePolling('sub-3', onResult))

    // First poll fires at 300 ms
    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    expect(api.get).toHaveBeenCalledTimes(1)
    expect(onResult).toHaveBeenCalledTimes(1)
    expect(onResult).toHaveBeenCalledWith({ id: 'sub-3', status: 'AC' })

    // Advance far beyond next expected delay — no more polls should fire
    await act(async () => {
      vi.advanceTimersByTime(60000)
    })

    expect(api.get).toHaveBeenCalledTimes(1)
  })

  it('stops polling on unmount (no further calls after unmount)', async () => {
    api.get.mockResolvedValue({ data: { id: 'sub-4', status: 'Pending' } })
    const onResult = vi.fn()

    const { unmount } = renderHook(() => useAdaptivePolling('sub-4', onResult))

    // First poll fires
    await act(async () => {
      vi.advanceTimersByTime(300)
    })
    expect(api.get).toHaveBeenCalledTimes(1)

    // Unmount before the second poll fires
    unmount()

    // Advance past the second delay — no more calls
    await act(async () => {
      vi.advanceTimersByTime(60000)
    })

    expect(api.get).toHaveBeenCalledTimes(1)
  })

  it('calls onResult with the terminal submission object', async () => {
    const terminalSubmission = { id: 'sub-5', status: 'WA', score: 0 }
    api.get.mockResolvedValue({ data: terminalSubmission })
    const onResult = vi.fn()

    renderHook(() => useAdaptivePolling('sub-5', onResult))

    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    expect(onResult).toHaveBeenCalledWith(terminalSubmission)
  })

  it('does not start polling when submissionId is null', async () => {
    const onResult = vi.fn()

    renderHook(() => useAdaptivePolling(null, onResult))

    await act(async () => {
      vi.advanceTimersByTime(60000)
    })

    expect(api.get).not.toHaveBeenCalled()
    expect(onResult).not.toHaveBeenCalled()
  })

  it('terminal statuses CE, TLE, MLE, RE, WA all stop polling', async () => {
    const terminalStatuses = ['CE', 'TLE', 'MLE', 'RE', 'WA']

    for (const status of terminalStatuses) {
      api.get.mockResolvedValue({ data: { id: 'sub-t', status } })
      const onResult = vi.fn()

      const { unmount } = renderHook(() =>
        useAdaptivePolling('sub-t', onResult),
      )

      await act(async () => {
        vi.advanceTimersByTime(300)
      })

      expect(api.get).toHaveBeenCalledTimes(1)

      await act(async () => {
        vi.advanceTimersByTime(60000)
      })

      // No second call
      expect(api.get).toHaveBeenCalledTimes(1)

      unmount()
      vi.clearAllMocks()
    }
  })
})
