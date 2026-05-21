/**
 * Tests for useOfflineRecovery hook.
 *
 * useOfflineRecovery:
 *   - On mount, checks localStorage for `pending:{problemId}` keys.
 *   - If a pending key exists → calls onPendingFound(problemId, submissionId).
 *   - If no pending key and examStatus === 'Ongoing' → calls
 *     GET /api/v1/submissions/latest?problem_id=X&exam_id=Y
 *   - If the latest submission is non-terminal → writes pending key and calls onPendingFound.
 *   - If the latest submission is terminal (or 404/error) → does nothing.
 */

import { renderHook, act, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { useOfflineRecovery } from './useOfflineRecovery'

vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn(),
  },
}))

import api from '@/lib/api'

const EXAM_ID = 'exam-xyz'
const PROBLEMS = [{ problem_id: 10 }, { problem_id: 20 }]

describe('useOfflineRecovery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls onPendingFound when a pending key exists in localStorage', async () => {
    // Set pending key for BOTH problems so the hook never falls through to /latest
    localStorage.setItem(
      'pending:10',
      JSON.stringify({ submissionId: 'sub-10', ts: Date.now() }),
    )
    localStorage.setItem(
      'pending:20',
      JSON.stringify({ submissionId: 'sub-20', ts: Date.now() }),
    )

    const onPendingFound = vi.fn()

    renderHook(() =>
      useOfflineRecovery(PROBLEMS, EXAM_ID, 'Ongoing', onPendingFound),
    )

    await waitFor(() => {
      expect(onPendingFound).toHaveBeenCalledWith(10, 'sub-10')
    })

    // Should NOT have called the API because pending keys existed for both problems
    expect(api.get).not.toHaveBeenCalled()
  })

  it('calls onPendingFound for each problem that has a pending key', async () => {
    localStorage.setItem(
      'pending:10',
      JSON.stringify({ submissionId: 'sub-10', ts: 0 }),
    )
    localStorage.setItem(
      'pending:20',
      JSON.stringify({ submissionId: 'sub-20', ts: 0 }),
    )

    const onPendingFound = vi.fn()

    renderHook(() =>
      useOfflineRecovery(PROBLEMS, EXAM_ID, 'Ongoing', onPendingFound),
    )

    await waitFor(() => {
      expect(onPendingFound).toHaveBeenCalledTimes(2)
    })

    expect(onPendingFound).toHaveBeenCalledWith(10, 'sub-10')
    expect(onPendingFound).toHaveBeenCalledWith(20, 'sub-20')
  })

  it('falls back to GET /submissions/latest when no pending key and exam is Ongoing', async () => {
    // No pending keys in localStorage
    api.get.mockResolvedValue({
      data: { id: 'sub-from-api', status: 'Judging' },
    })

    const onPendingFound = vi.fn()

    renderHook(() =>
      useOfflineRecovery(
        [{ problem_id: 10 }],
        EXAM_ID,
        'Ongoing',
        onPendingFound,
      ),
    )

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/api/v1/submissions/latest', {
        params: { problem_id: 10, exam_id: EXAM_ID },
      })
    })

    await waitFor(() => {
      expect(onPendingFound).toHaveBeenCalledWith(10, 'sub-from-api')
    })

    // Also writes the pending key to localStorage for future cold restarts
    const stored = JSON.parse(localStorage.getItem('pending:10'))
    expect(stored.submissionId).toBe('sub-from-api')
  })

  it('does NOT call GET /submissions/latest when exam is not Ongoing', async () => {
    const onPendingFound = vi.fn()

    renderHook(() =>
      useOfflineRecovery(
        [{ problem_id: 10 }],
        EXAM_ID,
        'Finished', // not Ongoing
        onPendingFound,
      ),
    )

    // Give the effect time to run
    await act(async () => {})

    expect(api.get).not.toHaveBeenCalled()
    expect(onPendingFound).not.toHaveBeenCalled()
  })

  it('does NOT call onPendingFound when /submissions/latest returns a terminal status', async () => {
    api.get.mockResolvedValue({
      data: { id: 'sub-terminal', status: 'AC' },
    })

    const onPendingFound = vi.fn()

    renderHook(() =>
      useOfflineRecovery(
        [{ problem_id: 10 }],
        EXAM_ID,
        'Ongoing',
        onPendingFound,
      ),
    )

    await waitFor(() => {
      expect(api.get).toHaveBeenCalled()
    })

    // Wait a bit for the async logic to finish
    await act(async () => {})

    expect(onPendingFound).not.toHaveBeenCalled()
  })

  it('does nothing when problems array is empty', async () => {
    const onPendingFound = vi.fn()

    renderHook(() => useOfflineRecovery([], EXAM_ID, 'Ongoing', onPendingFound))

    await act(async () => {})

    expect(api.get).not.toHaveBeenCalled()
    expect(onPendingFound).not.toHaveBeenCalled()
  })

  it('does nothing when examId is null/undefined', async () => {
    const onPendingFound = vi.fn()

    renderHook(() =>
      useOfflineRecovery(PROBLEMS, null, 'Ongoing', onPendingFound),
    )

    await act(async () => {})

    expect(api.get).not.toHaveBeenCalled()
    expect(onPendingFound).not.toHaveBeenCalled()
  })

  it('handles 404 from /submissions/latest gracefully (no crash, no onPendingFound)', async () => {
    const notFound = Object.assign(new Error('Not Found'), {
      response: { status: 404 },
    })
    api.get.mockRejectedValue(notFound)

    const onPendingFound = vi.fn()

    renderHook(() =>
      useOfflineRecovery(
        [{ problem_id: 10 }],
        EXAM_ID,
        'Ongoing',
        onPendingFound,
      ),
    )

    await waitFor(() => {
      expect(api.get).toHaveBeenCalled()
    })

    await act(async () => {})

    expect(onPendingFound).not.toHaveBeenCalled()
  })
})
