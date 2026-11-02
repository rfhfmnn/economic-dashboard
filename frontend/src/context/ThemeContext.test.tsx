import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent, renderHook, act, waitFor } from '@testing-library/react'
import { ThemeProvider, useTheme } from './ThemeContext'
import { Header } from '../components/layout/Header'

describe('ThemeContext and Theme Switching', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.className = ''
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            bcra_connected: true,
            offline_mode: false,
            timestamp: new Date().toISOString(),
          }),
      })
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    document.documentElement.className = ''
  })

  it('defaults to dark mode when no preference is saved in localStorage', () => {
    const { result } = renderHook(() => useTheme(), {
      wrapper: ({ children }) => <ThemeProvider>{children}</ThemeProvider>,
    })

    expect(result.current.theme).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.classList.contains('light')).toBe(false)
  })

  it('toggles from dark to light mode and updates DOM and localStorage', () => {
    const { result } = renderHook(() => useTheme(), {
      wrapper: ({ children }) => <ThemeProvider>{children}</ThemeProvider>,
    })

    act(() => {
      result.current.toggleTheme()
    })

    expect(result.current.theme).toBe('light')
    expect(localStorage.getItem('theme')).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(document.documentElement.classList.contains('light')).toBe(true)

    // Toggle back to dark
    act(() => {
      result.current.toggleTheme()
    })

    expect(result.current.theme).toBe('dark')
    expect(localStorage.getItem('theme')).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.classList.contains('light')).toBe(false)
  })

  it('initializes with stored theme preference from localStorage', () => {
    localStorage.setItem('theme', 'light')

    const { result } = renderHook(() => useTheme(), {
      wrapper: ({ children }) => <ThemeProvider>{children}</ThemeProvider>,
    })

    expect(result.current.theme).toBe('light')
    expect(document.documentElement.classList.contains('light')).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('renders theme toggle in Header and switches theme on click', async () => {
    render(
      <ThemeProvider>
        <Header />
      </ThemeProvider>
    )

    const toggleBtn = screen.getByTestId('theme-toggle')
    expect(toggleBtn).toBeInTheDocument()
    expect(toggleBtn).toHaveAttribute('aria-label', 'Cambiar a modo claro')

    // Click to switch to light mode
    await act(async () => {
      fireEvent.click(toggleBtn)
    })

    await waitFor(() => {
      expect(toggleBtn).toHaveAttribute('aria-label', 'Cambiar a modo oscuro')
      expect(document.documentElement.classList.contains('light')).toBe(true)
      expect(document.documentElement.classList.contains('dark')).toBe(false)
      expect(localStorage.getItem('theme')).toBe('light')
    })
  })
})
