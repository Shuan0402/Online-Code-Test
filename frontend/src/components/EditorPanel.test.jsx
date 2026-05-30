/**
 * Tests for EditorPanel component.
 *
 * EditorPanel:
 *   - Loads draft from localStorage on mount (key: draft:exam:{examId}:problem:{problemId})
 *   - Debounces localStorage write by 1s after code change
 *   - Exposes flushDraft() via ref that synchronously writes current code to localStorage
 *   - Reloads draft when problemId changes
 *
 * Monaco does NOT render in jsdom — we mock @monaco-editor/react with a lightweight
 * textarea stub that calls the onChange prop, so tests exercise the draft logic directly.
 */

import { render, screen, fireEvent, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createRef } from 'react'
import EditorPanel from './EditorPanel'

// Lightweight Monaco stub: renders a textarea and delegates to onChange prop.
vi.mock('@monaco-editor/react', () => ({
  default: function MonacoStub({ value, onChange }) {
    return (
      <textarea
        data-testid="monaco-stub"
        value={value}
        onChange={(e) => onChange && onChange(e.target.value)}
        readOnly={!onChange}
      />
    )
  },
}))

// Stub @/components/ui/button so we don't need the full shadcn tree.
vi.mock('@/components/ui/button', () => ({
  Button: function Button({ children, onClick, disabled }) {
    return (
      <button onClick={onClick} disabled={disabled}>
        {children}
      </button>
    )
  },
}))

const EXAM_ID = 'exam-abc'
const PROBLEM_ID = 42

describe('EditorPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('loads existing draft from localStorage on mount', () => {
    const draftKey = `draft:exam:${EXAM_ID}:problem:${PROBLEM_ID}`
    localStorage.setItem(draftKey, 'my saved code')

    render(
      <EditorPanel
        examId={EXAM_ID}
        problemId={PROBLEM_ID}
        onSubmit={vi.fn()}
        submitting={false}
      />
    )

    const textarea = screen.getByTestId('monaco-stub')
    expect(textarea.value).toBe('my saved code')
  })

  it('flushDraft() synchronously writes current code to the correct localStorage key', () => {
    const ref = createRef()
    const draftKey = `draft:exam:${EXAM_ID}:problem:${PROBLEM_ID}`

    render(
      <EditorPanel
        ref={ref}
        examId={EXAM_ID}
        problemId={PROBLEM_ID}
        onSubmit={vi.fn()}
        submitting={false}
      />
    )

    // Type some code via the textarea stub
    const textarea = screen.getByTestId('monaco-stub')
    fireEvent.change(textarea, { target: { value: 'print("hello")' } })

    // Debounce has NOT fired yet — nothing in localStorage yet
    expect(localStorage.getItem(draftKey)).toBeNull()

    // Call flushDraft() — should write synchronously
    act(() => {
      ref.current.flushDraft()
    })

    expect(localStorage.getItem(draftKey)).toBe('print("hello")')
  })

  it('debounced write lands in localStorage after 1 second', () => {
    const draftKey = `draft:exam:${EXAM_ID}:problem:${PROBLEM_ID}`

    render(
      <EditorPanel
        examId={EXAM_ID}
        problemId={PROBLEM_ID}
        onSubmit={vi.fn()}
        submitting={false}
      />
    )

    const textarea = screen.getByTestId('monaco-stub')
    fireEvent.change(textarea, { target: { value: 'debounced code' } })

    // Not yet
    expect(localStorage.getItem(draftKey)).toBeNull()

    // Advance 999ms — still not yet
    act(() => { vi.advanceTimersByTime(999) })
    expect(localStorage.getItem(draftKey)).toBeNull()

    // Advance 1ms more (total 1000ms) — fires
    act(() => { vi.advanceTimersByTime(1) })
    expect(localStorage.getItem(draftKey)).toBe('debounced code')
  })

  it('switching problemId reloads the draft for the new key', () => {
    const key1 = `draft:exam:${EXAM_ID}:problem:1`
    const key2 = `draft:exam:${EXAM_ID}:problem:2`
    localStorage.setItem(key1, 'code for problem 1')
    localStorage.setItem(key2, 'code for problem 2')

    const { rerender } = render(
      <EditorPanel
        examId={EXAM_ID}
        problemId={1}
        onSubmit={vi.fn()}
        submitting={false}
      />
    )

    let textarea = screen.getByTestId('monaco-stub')
    expect(textarea.value).toBe('code for problem 1')

    // Switch to problem 2
    rerender(
      <EditorPanel
        examId={EXAM_ID}
        problemId={2}
        onSubmit={vi.fn()}
        submitting={false}
      />
    )

    textarea = screen.getByTestId('monaco-stub')
    expect(textarea.value).toBe('code for problem 2')
  })

  it('flushDraft() cancels any pending debounce timer', () => {
    const ref = createRef()
    const draftKey = `draft:exam:${EXAM_ID}:problem:${PROBLEM_ID}`

    render(
      <EditorPanel
        ref={ref}
        examId={EXAM_ID}
        problemId={PROBLEM_ID}
        onSubmit={vi.fn()}
        submitting={false}
      />
    )

    const textarea = screen.getByTestId('monaco-stub')
    fireEvent.change(textarea, { target: { value: 'version 1' } })

    // Flush immediately
    act(() => { ref.current.flushDraft() })
    expect(localStorage.getItem(draftKey)).toBe('version 1')

    // Now advance well past 1s — no second write should happen (debounce was cancelled).
    // Spy on the actual mock object (not Storage.prototype) because setup.js replaces
    // the global localStorage with a plain object via vi.stubGlobal — that object is NOT
    // a native Storage instance, so Storage.prototype.setItem is never invoked.
    const setItemSpy = vi.spyOn(localStorage, 'setItem')
    act(() => { vi.advanceTimersByTime(2000) })
    // setItem should not have been called again after the flush
    expect(setItemSpy).not.toHaveBeenCalled()
    setItemSpy.mockRestore()
  })

  it('handles language changes and saves draft', () => {
    const draftKey = `draft:exam:${EXAM_ID}:problem:${PROBLEM_ID}`
    render(
      <EditorPanel
        examId={EXAM_ID}
        problemId={PROBLEM_ID}
        onSubmit={vi.fn()}
        submitting={false}
      />
    )

    const textarea = screen.getByTestId('monaco-stub')
    fireEvent.change(textarea, { target: { value: 'some code' } })

    const select = screen.getByLabelText('語言：')
    fireEvent.change(select, { target: { value: 'cpp' } })

    expect(localStorage.getItem(draftKey)).toBe('some code')
  })

  it('calls onSubmit when the submit button is clicked', () => {
    const onSubmitSpy = vi.fn()
    render(
      <EditorPanel
        examId={EXAM_ID}
        problemId={PROBLEM_ID}
        onSubmit={onSubmitSpy}
        submitting={false}
      />
    )

    const textarea = screen.getByTestId('monaco-stub')
    fireEvent.change(textarea, { target: { value: 'my code' } })

    const button = screen.getByRole('button', { name: '提交本題' })
    fireEvent.click(button)

    expect(onSubmitSpy).toHaveBeenCalledWith('my code', 'python')
  })
})
