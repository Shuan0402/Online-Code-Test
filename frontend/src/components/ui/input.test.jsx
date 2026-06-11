import * as React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { Input } from './input'

describe('Input Component', () => {
  it('renders input element correctly', () => {
    render(<Input data-testid="test-input" />)
    const input = screen.getByTestId('test-input')
    expect(input).toBeInTheDocument()
    expect(input.tagName).toBe('INPUT')
  })

  it('applies custom className alongside default classes', () => {
    render(<Input data-testid="test-input" className="custom-class" />)
    const input = screen.getByTestId('test-input')
    expect(input).toHaveClass('custom-class')
    expect(input).toHaveClass('flex')
    expect(input).toHaveClass('h-10')
  })

  it('supports type prop', () => {
    render(<Input data-testid="test-input" type="password" />)
    const input = screen.getByTestId('test-input')
    expect(input).toHaveAttribute('type', 'password')
  })

  it('forwards refs correctly', () => {
    const ref = React.createRef()
    render(<Input ref={ref} />)
    expect(ref.current).toBeInstanceOf(HTMLInputElement)
  })

  it('passes other standard HTML input props', () => {
    const handleChange = vi.fn()
    render(
      <Input
        data-testid="test-input"
        placeholder="Enter name"
        disabled
        onChange={handleChange}
      />
    )
    const input = screen.getByTestId('test-input')
    expect(input).toHaveAttribute('placeholder', 'Enter name')
    expect(input).toBeDisabled()
  })
})
