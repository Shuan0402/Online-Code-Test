/**
 * Tests for ProblemFormPage.
 *
 * 覆蓋場景：
 * (a) create 模式渲染空欄位
 * (b) edit 模式：mocked GET 200 後填入欄位與測資列
 * (c) 新增一筆測資列並送出 POST，body 中的 test_cases[0] 無 id 且無 _clientKey
 * (d) 必填欄位驗證：空 title 阻擋 submit，顯示中文錯誤，POST spy 不被呼叫
 */

import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

// --- mock @/lib/api ---
vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}))

// --- mock ui/button ---
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, type }) => (
    <button onClick={onClick} disabled={disabled} type={type ?? 'button'}>
      {children}
    </button>
  ),
}))

// --- mock ui/input ---
vi.mock('@/components/ui/input', () => ({
  Input: ({ id, type, value, onChange, placeholder, min }) => (
    <input
      id={id}
      type={type ?? 'text'}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      min={min}
    />
  ),
}))

// --- mock ui/label ---
vi.mock('@/components/ui/label', () => ({
  Label: ({ children, htmlFor }) => <label htmlFor={htmlFor}>{children}</label>,
}))

// --- mock LoadingSpinner ---
vi.mock('@/components/LoadingSpinner', () => ({
  default: () => <div data-testid="loading-spinner" />,
}))

// --- mock ErrorMessage ---
vi.mock('@/components/ErrorMessage', () => ({
  default: ({ message, onRetry }) => (
    <div>
      <span data-testid="error-message">{message}</span>
      {onRetry && <button onClick={onRetry}>重試</button>}
    </div>
  ),
}))

import api from '@/lib/api'
import ProblemFormPage from './ProblemFormPage'

// 在 create 模式下渲染 (/questioner/problems/new — id is undefined)
function renderCreateMode() {
  return render(
    <MemoryRouter initialEntries={['/questioner/problems/new']}>
      <Routes>
        <Route path="/questioner/problems/new" element={<ProblemFormPage />} />
      </Routes>
    </MemoryRouter>
  )
}

// 在 edit 模式下渲染 (/questioner/problems/42/edit — id=42)
function renderEditMode() {
  return render(
    <MemoryRouter initialEntries={['/questioner/problems/42/edit']}>
      <Routes>
        <Route path="/questioner/problems/:id/edit" element={<ProblemFormPage />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('ProblemFormPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // (a) create 模式渲染空欄位
  it('create mode renders empty title field and no test-case rows', () => {
    renderCreateMode()

    // 標題欄位存在且為空
    const titleInput = screen.getByPlaceholderText('請輸入題目標題')
    expect(titleInput.value).toBe('')

    // 無測資列（create 模式初始 state 為空陣列）
    expect(screen.queryByText(/測資 #/)).not.toBeInTheDocument()

    // api.get 不應被呼叫
    expect(api.get).not.toHaveBeenCalled()
  })

  // (b) edit 模式 — GET 200 後欄位與測資列被填入
  it('edit mode fetches problem and pre-populates fields including test-case rows', async () => {
    api.get.mockResolvedValue({
      data: {
        id: 42,
        title: '已存在的題目',
        description: '詳細描述',
        difficulty: 'Medium',
        time_limit_ms: 2000,
        memory_limit_mb: 512,
        test_cases: [
          { id: 10, input_data: '1 2', expected_output: '3', score_weight: 20, is_sample: true },
        ],
      },
    })

    renderEditMode()

    // 等待 GET 完成、UI 更新
    await waitFor(() => {
      expect(screen.getByDisplayValue('已存在的題目')).toBeInTheDocument()
    })

    // 測資列出現
    expect(screen.getByText(/測資 #1/)).toBeInTheDocument()

    // 輸入資料欄位被填入
    expect(screen.getByDisplayValue('1 2')).toBeInTheDocument()

    expect(api.get).toHaveBeenCalledWith('/api/v1/problems/42')
  })

  // (c) create 模式新增一筆測資列並 submit — POST body 的 test_cases[0] 沒有 id 且沒有 _clientKey
  it('submitting create with a new test-case row sends POST with no id and no _clientKey on the row', async () => {
    api.post.mockResolvedValue({ data: { id: 99 } })

    renderCreateMode()

    // 填寫標題
    fireEvent.change(screen.getByPlaceholderText('請輸入題目標題'), {
      target: { value: '新題目' },
    })

    // 點「新增一筆測資」
    fireEvent.click(screen.getByText('新增一筆測資'))

    // 測資列出現
    await waitFor(() => {
      expect(screen.getByText(/測資 #1/)).toBeInTheDocument()
    })

    // 填寫輸入資料
    fireEvent.change(screen.getByPlaceholderText('測資輸入（stdin）'), {
      target: { value: '5' },
    })
    // 填寫預期輸出
    fireEvent.change(screen.getByPlaceholderText('預期輸出（stdout）'), {
      target: { value: '25' },
    })

    // 送出表單（getByRole 取 submit 按鈕以避免和 h1 的文字衝突）
    fireEvent.click(screen.getByRole('button', { name: '新增題目' }))

    await waitFor(() => {
      expect(api.post).toHaveBeenCalled()
    })

    const postedBody = api.post.mock.calls[0][1]
    const tc0 = postedBody.test_cases[0]

    // 新增的測資不帶 id
    expect(tc0).not.toHaveProperty('id')
    // _clientKey 不送至後端
    expect(tc0).not.toHaveProperty('_clientKey')
    // 有正確的資料欄位
    expect(tc0.input_data).toBe('5')
    expect(tc0.expected_output).toBe('25')
  })

  // (d) 必填驗證：空 title 阻擋送出，顯示中文錯誤，POST 不被呼叫
  it('empty title blocks submit and shows Chinese validation error without calling api', async () => {
    renderCreateMode()

    // 新增一筆測資（避免觸發測資驗證）
    fireEvent.click(screen.getByText('新增一筆測資'))

    await waitFor(() => {
      expect(screen.getByText(/測資 #1/)).toBeInTheDocument()
    })

    // 不填 title，直接送出（取 submit 按鈕以避免和 h1 文字衝突）
    fireEvent.click(screen.getByRole('button', { name: '新增題目' }))

    // 驗證錯誤訊息出現（純中文）
    await waitFor(() => {
      expect(screen.getByText('請填寫題目標題')).toBeInTheDocument()
    })

    // POST spy 沒被呼叫
    expect(api.post).not.toHaveBeenCalled()
  })

  // 額外：缺少測資的驗證
  it('no test cases blocks submit and shows Chinese validation error', async () => {
    renderCreateMode()

    // 填寫標題但不新增測資
    fireEvent.change(screen.getByPlaceholderText('請輸入題目標題'), {
      target: { value: '有標題但沒測資' },
    })

    fireEvent.click(screen.getByRole('button', { name: '新增題目' }))

    await waitFor(() => {
      expect(screen.getByText('至少需要一筆測試資料')).toBeInTheDocument()
    })

    expect(api.post).not.toHaveBeenCalled()
  })

  // 額外：edit 模式 404 顯示錯誤訊息
  it('edit mode 404 shows 載入失敗 error message', async () => {
    api.get.mockRejectedValue({ response: { status: 404 } })

    renderEditMode()

    await waitFor(() => {
      expect(screen.getByText('載入失敗，找不到此題目')).toBeInTheDocument()
    })
  })
})
