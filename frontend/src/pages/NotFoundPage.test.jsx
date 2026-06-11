import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import NotFoundPage from './NotFoundPage'

describe('NotFoundPage', () => {
  it('renders the 404 header and text correctly', () => {
    render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>
    )

    expect(screen.getByRole('heading', { name: '404' })).toBeInTheDocument()
    expect(screen.getByText('找不到頁面')).toBeInTheDocument()
  })

  it('renders the link to home page', () => {
    render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>
    )

    const homeLink = screen.getByRole('link', { name: '回首頁' })
    expect(homeLink).toBeInTheDocument()
    expect(homeLink.getAttribute('href')).toBe('/')
  })
})
