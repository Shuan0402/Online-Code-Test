import { useState } from 'react'

import api from '@/lib/api'
import TagMultiSelect from '@/components/TagMultiSelect'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const ACCEPTED_EXTENSIONS = ['.csv', '.xlsx', '.xls']

function isAcceptedFile(file) {
  const lower = file.name.toLowerCase()
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

export default function CandidateBatchImportDialog({ open, onOpenChange, onSuccess }) {
  const [file, setFile] = useState(null)
  const [tags, setTags] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  const resetForm = () => {
    setFile(null)
    setTags([])
    setError(null)
    setResult(null)
    setSubmitting(false)
  }

  const handleOpenChange = (nextOpen) => {
    if (!nextOpen) resetForm()
    onOpenChange(nextOpen)
  }

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0] ?? null
    setError(null)
    setResult(null)
    if (!selected) {
      setFile(null)
      return
    }
    if (!isAcceptedFile(selected)) {
      setFile(null)
      setError('僅支援 .csv、.xlsx、.xls 檔案')
      e.target.value = ''
      return
    }
    setFile(selected)
  }

  const handleSubmit = async () => {
    setError(null)
    if (!file) {
      setError('請選擇要上傳的檔案')
      return
    }

    setSubmitting(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('tags', JSON.stringify(tags))

      const res = await api.post('/api/v1/users/batch-import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setResult(res.data)
      if (res.data.created > 0) {
        onSuccess?.()
      }
    } catch (err) {
      setError(err.response?.data?.detail ?? '批次匯入失敗，請稍後再試')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>批次新增考生</DialogTitle>
          <DialogDescription>
            上傳 CSV 或 Excel 檔案，欄位需包含「真實姓名」與「帳號」。密碼將由系統依帳號自動產生。
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="batch-import-file" className="text-sm font-medium">
                匯入檔案
              </label>
              <input
                id="batch-import-file"
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileChange}
                className="block w-full text-sm file:mr-3 file:rounded file:border file:border-input file:bg-background file:px-3 file:py-1.5"
              />
              {file && (
                <p className="text-xs text-muted-foreground">已選擇：{file.name}</p>
              )}
            </div>

            <TagMultiSelect
              value={tags}
              onChange={setTags}
              label="統一標籤（選填）"
              containerId="batch-import-tags"
            />

            {error && (
              <p className="text-sm font-medium text-destructive">{error}</p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm">
              共 {result.total} 筆，成功 {result.created} 筆，失敗 {result.failed} 筆
            </p>
            <div className="rounded-lg border overflow-hidden max-h-64 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">列</th>
                    <th className="px-3 py-2 text-left">帳號</th>
                    <th className="px-3 py-2 text-left">姓名</th>
                    <th className="px-3 py-2 text-left">狀態</th>
                    <th className="px-3 py-2 text-left">密碼</th>
                  </tr>
                </thead>
                <tbody>
                  {result.results.map((row) => (
                    <tr key={`${row.row}-${row.username}`} className="border-t">
                      <td className="px-3 py-2">{row.row}</td>
                      <td className="px-3 py-2">{row.username}</td>
                      <td className="px-3 py-2">{row.full_name ?? '—'}</td>
                      <td className="px-3 py-2">
                        {row.status === 'created' ? (
                          <span className="text-green-600">成功</span>
                        ) : (
                          <span className="text-destructive" title={row.message}>
                            失敗
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {row.generated_password ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {result.failed > 0 && (
              <ul className="text-xs text-muted-foreground space-y-1">
                {result.results
                  .filter((r) => r.status !== 'created')
                  .map((r) => (
                    <li key={`err-${r.row}-${r.username}`}>
                      第 {r.row} 列（{r.username || '—'}）：{r.message}
                    </li>
                  ))}
              </ul>
            )}
          </div>
        )}

        <DialogFooter>
          {!result ? (
            <>
              <Button variant="outline" type="button" onClick={() => handleOpenChange(false)}>
                取消
              </Button>
              <Button type="button" disabled={submitting} onClick={handleSubmit}>
                {submitting ? '匯入中…' : '開始匯入'}
              </Button>
            </>
          ) : (
            <Button type="button" onClick={() => handleOpenChange(false)}>
              關閉
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
