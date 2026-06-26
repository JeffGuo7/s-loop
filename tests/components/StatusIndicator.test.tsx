// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusIndicator } from '../../src/components/chat/shared/StatusIndicator'

describe('StatusIndicator', () => {
  it('renders a clock icon for pending state', () => {
    const { container } = render(<StatusIndicator state={{ status: 'pending' }} />)
    // lucide Clock icon has aria-hidden; check the svg is present
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
    expect(svg!.getAttribute('class')).toContain('warning')
  })

  it('renders a spinning loader for running state', () => {
    const { container } = render(<StatusIndicator state={{ status: 'running' }} />)
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
    expect(svg!.getAttribute('class')).toContain('animate-spin')
  })

  it('renders a check circle for completed state', () => {
    const { container } = render(<StatusIndicator state={{ status: 'completed' }} />)
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
    expect(svg!.getAttribute('class')).toContain('success')
  })

  it('renders an X circle for error state', () => {
    const { container } = render(<StatusIndicator state={{ status: 'error', error: 'oops' }} />)
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
    expect(svg!.getAttribute('class')).toContain('error')
  })

  it('accepts a custom size', () => {
    const { container } = render(<StatusIndicator state={{ status: 'running' }} size={24} />)
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
    expect(svg!.getAttribute('width')).toBe('24')
  })
})
