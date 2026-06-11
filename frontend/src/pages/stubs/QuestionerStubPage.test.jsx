import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import QuestionerStubPage from './QuestionerStubPage'

describe('QuestionerStubPage', () => {
  it('renders the placeholder text correctly', () => {
    render(<QuestionerStubPage />)
    expect(screen.getByText('功能開發中')).toBeInTheDocument()
  })
})
