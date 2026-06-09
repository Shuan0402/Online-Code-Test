import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import { Button } from '@/components/ui/button'

const LANGUAGE_OPTIONS = [
  { value: 'python', label: 'Python' },
  { value: 'cpp',    label: 'C++' },
]

// Monaco 的 language id 對應（cpp 要對應到 Monaco 的 'cpp'）
const MONACO_LANG_MAP = {
  python: 'python',
  cpp:    'cpp',
}

const DEFAULT_CODE = {
  python: '# 請在此輸入您的 Python 程式碼\n',
  cpp: '// 請在此輸入您的 C++ 程式碼\n#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    \n    return 0;\n}\n',
}

/**
 * EditorPanel
 *
 * @param {string}   examId       — 考試 UUID
 * @param {number}   problemId    — 題目 ID
 * @param {function} onSubmit     — (code: string, language: string) => void
 * @param {boolean}  submitting   — 提交進行中旗標
 */
// forwardRef so TakeExamPage can call editorRef.current.flushDraft() synchronously
// before changing the active problem index, preventing draft loss on rapid tab switch.
const EditorPanel = forwardRef(function EditorPanel({ examId, problemId, onSubmit, submitting }, ref) {
  // Bug 5：每個語言各存自己的 draft，切語言時保留 Python 寫到一半的內容、
  // 也不會把 Python 註解 / code 帶到 C++ 視窗。
  const draftKeyFor = (lang) => `draft:exam:${examId}:problem:${problemId}:lang:${lang}`

  const [language, setLanguage] = useState('python')
  const [code, setCode] = useState(
    () => localStorage.getItem(draftKeyFor('python')) ?? DEFAULT_CODE.python
  )
  const debounceRef = useRef(null)
  // codeRef always has the latest code for synchronous flush (avoids stale closure)
  const codeRef = useRef(code)
  // langRef 同上，確保 flushDraft 與 unmount cleanup 用到對的 key
  const langRef = useRef(language)

  // Expose flushDraft() so the parent can synchronously persist the current
  // editor contents to localStorage before switching to another problem tab.
  useImperativeHandle(ref, () => ({
    flushDraft() {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
        debounceRef.current = null
      }
      localStorage.setItem(draftKeyFor(langRef.current), codeRef.current)
    },
  }))

  // 切換 problemId 或 examId 時重新載入該題目 + 該語言的草稿
  useEffect(() => {
    const saved = localStorage.getItem(draftKeyFor(language))
    const loaded = saved ?? DEFAULT_CODE[language]
    setCode(loaded)
    codeRef.current = loaded
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId, problemId])

  const handleCodeChange = (value = '') => {
    setCode(value)
    codeRef.current = value
    // 防抖 1 秒後寫入 localStorage（key 是「當下語言」）
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const keyAtTimeOfChange = draftKeyFor(langRef.current)
    debounceRef.current = setTimeout(() => {
      localStorage.setItem(keyAtTimeOfChange, value)
    }, 1000)
  }

  const handleLanguageChange = (e) => {
    const newLang = e.target.value
    // 1) 立刻 flush 舊語言當下草稿
    if (debounceRef.current) clearTimeout(debounceRef.current)
    localStorage.setItem(draftKeyFor(langRef.current), code)
    // 2) 載入新語言已存的草稿；沒有就用該語言的預設範本（含對應註解）
    const savedNew = localStorage.getItem(draftKeyFor(newLang))
    const nextCode = savedNew ?? DEFAULT_CODE[newLang]
    setLanguage(newLang)
    langRef.current = newLang
    setCode(nextCode)
    codeRef.current = nextCode
  }

  const handleSubmit = () => {
    if (onSubmit) onSubmit(code, language)
  }

  return (
    <div className="flex flex-col h-full">
      {/* 工具列 */}
      <div className="flex items-center gap-3 px-3 py-2 border-b bg-muted/20 shrink-0">
        <label className="text-sm font-medium text-muted-foreground" htmlFor="lang-select">
          語言：
        </label>
        <select
          id="lang-select"
          value={language}
          onChange={handleLanguageChange}
          className="text-sm border rounded px-2 py-1 bg-background"
          disabled={submitting}
        >
          {LANGUAGE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        <div className="flex-1" />

        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={submitting}
        >
          {submitting ? '提交中…' : '提交本題'}
        </Button>
      </div>

      {/* Monaco 編輯器（@monaco-editor/react 內建 lazy loading） */}
      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          language={MONACO_LANG_MAP[language]}
          value={code}
          onChange={handleCodeChange}
          theme="vs-dark"
          options={{
            fontSize: 14,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            automaticLayout: true,
          }}
        />
      </div>
    </div>
  )
})

export default EditorPanel
