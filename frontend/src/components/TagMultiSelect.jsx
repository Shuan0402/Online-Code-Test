import { useState, useEffect } from 'react'

import api from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function TagMultiSelect({
  value = [],
  onChange,
  label = '標籤',
  placeholder = '例如: 2026 校園徵才 - 前端工程師 (可輸入或篩選選取)',
  containerId = 'tag-multi-container',
}) {
  const [existingTags, setExistingTags] = useState([])
  const [inputValue, setInputValue] = useState('')
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    api
      .get('/api/v1/exams/tags')
      .then((res) => {
        if (!cancelled) setExistingTags(res.data ?? [])
      })
      .catch((err) => {
        console.error('無法載入標籤列表', err)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const handleOutsideClick = (e) => {
      const container = document.getElementById(containerId)
      if (container && !container.contains(e.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('click', handleOutsideClick)
    return () => {
      document.removeEventListener('click', handleOutsideClick)
    }
  }, [containerId])

  const availableTags = existingTags.filter((t) => !value.includes(t))
  const filteredTags = availableTags.filter((t) =>
    t.toLowerCase().includes(inputValue.toLowerCase())
  )

  const addTag = (tag) => {
    const trimmed = tag.trim()
    if (!trimmed || value.includes(trimmed)) return
    onChange([...value, trimmed])
    if (!existingTags.includes(trimmed)) {
      setExistingTags((prev) => [...prev, trimmed])
    }
    setInputValue('')
    setIsOpen(false)
  }

  const removeTag = (tag) => {
    onChange(value.filter((t) => t !== tag))
  }

  const handleAddNewTag = () => {
    addTag(inputValue)
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={`${containerId}-input`}>{label}</Label>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map((tag) => (
            <Badge key={tag} variant="secondary" className="gap-1 pr-1">
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="ml-1 rounded-full hover:bg-muted-foreground/20 p-0.5 leading-none"
                aria-label={`移除標籤 ${tag}`}
              >
                ×
              </button>
            </Badge>
          ))}
        </div>
      )}

      <div className="relative" id={containerId}>
        <div className="relative">
          <Input
            id={`${containerId}-input`}
            type="text"
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value)
              setIsOpen(true)
            }}
            onFocus={() => setIsOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                if (inputValue.trim()) handleAddNewTag()
              }
            }}
            placeholder={placeholder}
            autoComplete="off"
            className="pr-10"
          />
          <div
            className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground p-1"
            onClick={(e) => {
              e.stopPropagation()
              setIsOpen((prev) => !prev)
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </div>
        </div>

        {isOpen && (
          <div className="absolute left-0 right-0 mt-1 max-h-60 overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-md z-50">
            <ul className="py-1 text-sm">
              {filteredTags.length > 0 ? (
                filteredTags.map((t) => (
                  <li
                    key={t}
                    onClick={() => addTag(t)}
                    className="px-3 py-2 hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors"
                  >
                    {t}
                  </li>
                ))
              ) : (
                inputValue.trim() ? null : (
                  <li className="px-3 py-2 text-muted-foreground text-center">
                    目前沒有現有標籤
                  </li>
                )
              )}

              {inputValue.trim() && filteredTags.length === 0 && (
                <li
                  onClick={handleAddNewTag}
                  className="px-3 py-2 text-primary hover:bg-accent hover:text-accent-foreground cursor-pointer font-medium border-t border-muted transition-colors"
                >
                  + 新增標籤「{inputValue.trim()}」
                </li>
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
