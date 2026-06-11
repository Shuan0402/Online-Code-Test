import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import ErrorMessage from './ErrorMessage'

describe('ErrorMessage', () => {
  it('renders the error message correctly', () => {
    const testMessage = 'An unexpected error occurred'
    render(<ErrorMessage message={testMessage} />)
    expect(screen.getByText(testMessage)).toBeInTheDocument()
  })

  it('does not render the retry button if onRetry is not provided', () => {
    render(<ErrorMessage message="Something went wrong" />)
    expect(screen.queryByRole('button', { name: '重試' })).not.toBeInTheDocument()
  })

  it('renders the retry button and calls onRetry when clicked', () => {
    const handleRetry = vi.fn()
    render(<ErrorMessage message="Something went wrong" onRetry={handleRetry} />)

    const retryButton = screen.getByRole('button', { name: '重試' })
    expect(retryButton).toBeInTheDocument()

    fireEvent.click(retryButton)
    expect(handleRetry).toHaveBeenCalledTimes(1)
  })
})
