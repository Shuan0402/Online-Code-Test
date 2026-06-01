/**
 * Tests for EditorPanel component.
 *
 * EditorPanel:
 *   - Loads draft from localStorage on mount
 *     (key: draft:exam:{examId}:problem:{problemId}:lang:{language} — Bug 5: per-language)
 *   - Debounces localStorage write by 1s after code change
 *   - Exposes flushDraft() via ref that synchronously writes current code to localStorage
 *   - Reloads draft when problemId / examId changes
 *   - Bug 5: switching language flushes old lang's draft and loads new lang's saved draft
 *     (or DEFAULT_CODE[newLang] if none) — Python comment doesn't leak into C++ slot
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
    const draftKey = `draft:exam:${EXAM_ID}:problem:${PROBLEM_ID}:lang:python`
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
    const draftKey = `draft:exam:${EXAM_ID}:problem:${PROBLEM_ID}:lang:python`

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
    const draftKey = `draft:exam:${EXAM_ID}:problem:${PROBLEM_ID}:lang:python`

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
    const key1 = `draft:exam:${EXAM_ID}:problem:1:lang:python`
    const key2 = `draft:exam:${EXAM_ID}:problem:2:lang:python`
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
    const draftKey = `draft:exam:${EXAM_ID}:problem:${PROBLEM_ID}:lang:python`

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

  it('Bug 5: switching language flushes Python draft to its own key', () => {
    const pyKey = `draft:exam:${EXAM_ID}:problem:${PROBLEM_ID}:lang:python`
    render(
      <EditorPanel
        examId={EXAM_ID}
        problemId={PROBLEM_ID}
        onSubmit={vi.fn()}
        submitting={false}
      />
    )

    const textarea = screen.getByTestId('monaco-stub')
    fireEvent.change(textarea, { target: { value: 'a = 1' } })

    const select = screen.getByLabelText('語言：')
    fireEvent.change(select, { target: { value: 'cpp' } })

    // Python 草稿被 flush 到 lang:python key（不被丟掉）
    expect(localStorage.getItem(pyKey)).toBe('a = 1')
  })

  it('Bug 5: switching python → cpp loads C++ default template (not Python comment)', () => {
    render(
      <EditorPanel
        examId={EXAM_ID}
        problemId={PROBLEM_ID}
        onSubmit={vi.fn()}
        submitting={false}
      />
    )

    const textarea = screen.getByTestId('monaco-stub')
    // Python 視窗預設應為 Python 註解
    expect(textarea.value).toContain('Python')
    expect(textarea.value).not.toContain('#include')

    // 切到 C++
    const select = screen.getByLabelText('語言：')
    fireEvent.change(select, { target: { value: 'cpp' } })

    const cppArea = screen.getByTestId('monaco-stub')
    // 應換成 C++ 註解 + #include 樣板、Python 註解不該還在
    expect(cppArea.value).toContain('C++')
    expect(cppArea.value).toContain('#include')
    expect(cppArea.value).not.toContain('Python')
  })

  it('Bug 5: switching back to a language with saved draft restores its code', () => {
    const pyKey = `draft:exam:${EXAM_ID}:problem:${PROBLEM_ID}:lang:python`
    const cppKey = `draft:exam:${EXAM_ID}:problem:${PROBLEM_ID}:lang:cpp`
    localStorage.setItem(pyKey, 'print("python draft")')
    localStorage.setItem(cppKey, 'int x = 42;')

    render(
      <EditorPanel
        examId={EXAM_ID}
        problemId={PROBLEM_ID}
        onSubmit={vi.fn()}
        submitting={false}
      />
    )

    // 初始載入 python 草稿
    expect(screen.getByTestId('monaco-stub').value).toBe('print("python draft")')

    // 切 cpp → 載入 cpp 草稿
    const select = screen.getByLabelText('語言：')
    fireEvent.change(select, { target: { value: 'cpp' } })
    expect(screen.getByTestId('monaco-stub').value).toBe('int x = 42;')

    // 切回 python → 還原 python 草稿
    fireEvent.change(select, { target: { value: 'python' } })
    expect(screen.getByTestId('monaco-stub').value).toBe('print("python draft")')
  })

  it('Bug 5: edits made in cpp are saved to cpp key, not leaked to python key', () => {
    const pyKey = `draft:exam:${EXAM_ID}:problem:${PROBLEM_ID}:lang:python`
    const cppKey = `draft:exam:${EXAM_ID}:problem:${PROBLEM_ID}:lang:cpp`

    render(
      <EditorPanel
        examId={EXAM_ID}
        problemId={PROBLEM_ID}
        onSubmit={vi.fn()}
        submitting={false}
      />
    )

    const select = screen.getByLabelText('語言：')
    fireEvent.change(select, { target: { value: 'cpp' } })

    const textarea = screen.getByTestId('monaco-stub')
    fireEvent.change(textarea, { target: { value: 'cpp-only edit' } })

    // 跑滿 1s debounce
    act(() => { vi.advanceTimersByTime(1000) })

    expect(localStorage.getItem(cppKey)).toBe('cpp-only edit')
    expect(localStorage.getItem(pyKey)).not.toBe('cpp-only edit')
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

  // ── RUN_ONLY 試跑按鈕（共用 EditorPanel）─────────────────────────────────────
  it('RUN_ONLY：onRunOnly 沒帶時不顯示試跑按鈕（向後相容）', () => {
    render(
      <EditorPanel examId={EXAM_ID} problemId={PROBLEM_ID} onSubmit={vi.fn()} submitting={false} />
    )
    expect(screen.queryByRole('button', { name: '試跑' })).toBeNull()
  })

  it('RUN_ONLY：onRunOnly 帶入時顯示試跑按鈕、點擊 callback 被呼叫', () => {
    const onRunOnlySpy = vi.fn()
    render(
      <EditorPanel
        examId={EXAM_ID}
        problemId={PROBLEM_ID}
        onSubmit={vi.fn()}
        onRunOnly={onRunOnlySpy}
        submitting={false}
      />
    )
    const textarea = screen.getByTestId('monaco-stub')
    fireEvent.change(textarea, { target: { value: 'print(1)' } })

    fireEvent.click(screen.getByRole('button', { name: '試跑' }))
    expect(onRunOnlySpy).toHaveBeenCalledWith('print(1)', 'python')
  })

  it('RUN_ONLY：runOnlyRunning=true 時試跑按鈕變「試跑中…」且 disable', () => {
    render(
      <EditorPanel
        examId={EXAM_ID}
        problemId={PROBLEM_ID}
        onSubmit={vi.fn()}
        onRunOnly={vi.fn()}
        submitting={false}
        runOnlyRunning={true}
      />
    )
    const btn = screen.getByRole('button', { name: '試跑中…' })
    expect(btn).toBeDisabled()
  })

  it('RUN_ONLY：runOnlyRunning=true 時連帶把「提交本題」也 disable（避免雙開）', () => {
    render(
      <EditorPanel
        examId={EXAM_ID}
        problemId={PROBLEM_ID}
        onSubmit={vi.fn()}
        onRunOnly={vi.fn()}
        submitting={false}
        runOnlyRunning={true}
      />
    )
    expect(screen.getByRole('button', { name: '提交本題' })).toBeDisabled()
  })
})
