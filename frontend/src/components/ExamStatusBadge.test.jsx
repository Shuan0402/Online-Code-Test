import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import ExamStatusBadge from './ExamStatusBadge'

describe('ExamStatusBadge', () => {
  it('renders Draft status correctly', () => {
    const { container } = render(<ExamStatusBadge status="Draft" />)
    const badge = container.firstChild
    expect(screen.getByText('草稿')).toBeInTheDocument()
    expect(badge).toHaveClass('bg-gray-200')
    expect(badge).toHaveClass('text-gray-700')
  })

  it('renders Published status correctly', () => {
    const { container } = render(<ExamStatusBadge status="Published" />)
    const badge = container.firstChild
    expect(screen.getByText('已發佈')).toBeInTheDocument()
    expect(badge).toHaveClass('bg-blue-500')
    expect(badge).toHaveClass('text-white')
  })

  it('renders Ongoing status correctly', () => {
    const { container } = render(<ExamStatusBadge status="Ongoing" />)
    const badge = container.firstChild
    expect(screen.getByText('進行中')).toBeInTheDocument()
    expect(badge).toHaveClass('bg-green-500')
    expect(badge).toHaveClass('text-white')
  })

  it('renders Finished status correctly', () => {
    const { container } = render(<ExamStatusBadge status="Finished" />)
    const badge = container.firstChild
    expect(screen.getByText('已結束')).toBeInTheDocument()
    expect(badge).toHaveClass('bg-orange-400')
    expect(badge).toHaveClass('text-white')
  })

  it('renders Archived status correctly', () => {
    const { container } = render(<ExamStatusBadge status="Archived" />)
    const badge = container.firstChild
    expect(screen.getByText('已封存')).toBeInTheDocument()
    expect(badge).toHaveClass('bg-gray-500')
    expect(badge).toHaveClass('text-white')
  })

  it('falls back to raw status string and fallback classes for unknown status', () => {
    const { container } = render(<ExamStatusBadge status="UnknownStatus" />)
    const badge = container.firstChild
    expect(screen.getByText('UnknownStatus')).toBeInTheDocument()
    expect(badge).toHaveClass('bg-gray-300')
    expect(badge).toHaveClass('text-gray-700')
  })
})
