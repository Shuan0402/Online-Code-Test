import * as React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Label } from './label'

describe('Label Component', () => {
  it('renders label with children correctly', () => {
    render(<Label data-testid="test-label">Username</Label>)
    const label = screen.getByTestId('test-label')
    expect(label).toBeInTheDocument()
    expect(label).toHaveTextContent('Username')
  })

  it('applies default styles and custom className', () => {
    render(
      <Label data-testid="test-label" className="custom-label">
        Name
      </Label>
    )
    const label = screen.getByTestId('test-label')
    expect(label).toHaveClass('custom-label')
    expect(label).toHaveClass('text-sm')
    expect(label).toHaveClass('font-medium')
  })

  it('supports htmlFor attribute', () => {
    render(
      <Label data-testid="test-label" htmlFor="username-input">
        Username
      </Label>
    )
    const label = screen.getByTestId('test-label')
    expect(label).toHaveAttribute('for', 'username-input')
  })

  it('forwards refs correctly', () => {
    const ref = React.createRef()
    render(<Label ref={ref}>Ref Label</Label>)
    expect(ref.current).toBeInstanceOf(HTMLLabelElement)
  })
})
