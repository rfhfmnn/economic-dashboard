import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from './App'

describe('App Component', () => {
  it('renders the header and platform title', () => {
    render(<App />)
    expect(screen.getByText(/BCRA Economic & Credit Risk Monitor/i)).toBeDefined()
    expect(screen.getByText(/System Operational/i)).toBeDefined()
  })
})
