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
  const draftKey = `draft:exam:${examId}:problem:${problemId}`

  // 從 localStorage 取草稿，沒有就用預設程式碼
  const getInitialCode = (lang) => {
    const saved = localStorage.getItem(draftKey)
    return saved ?? DEFAULT_CODE[lang]
  }

  const [language, setLanguage] = useState('python')
  const [code, setCode] = useState(() => getInitialCode('python'))
  const debounceRef = useRef(null)
  // codeRef always has the latest code for synchronous flush (avoids stale closure)
  const codeRef = useRef(code)

  // Expose flushDraft() so the parent can synchronously persist the current
  // editor contents to localStorage before switching to another problem tab.
  useImperativeHandle(ref, () => ({
    flushDraft() {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
        debounceRef.current = null
      }
      localStorage.setItem(draftKey, codeRef.current)
    },
  }))

  // 切換 problemId 或 examId 時重新載入草稿
  useEffect(() => {
    const saved = localStorage.getItem(draftKey)
    const loaded = saved ?? DEFAULT_CODE[language]
    setCode(loaded)
    codeRef.current = loaded
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey])

  const handleCodeChange = (value) => {
    const newCode = value ?? ''
    setCode(newCode)
    codeRef.current = newCode
    // 防抖 1 秒後寫入 localStorage
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      localStorage.setItem(draftKey, newCode)
    }, 1000)
  }

  const handleLanguageChange = (e) => {
    const newLang = e.target.value
    // 先儲存舊草稿
    if (debounceRef.current) clearTimeout(debounceRef.current)
    localStorage.setItem(draftKey, code)
    setLanguage(newLang)
    // 切語言後不覆蓋草稿內容（草稿與語言分開儲存不在計畫內，維持現有草稿）
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
