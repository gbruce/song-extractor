import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('api', () => {
  it('derives the API base URL from the current browser hostname for remote access', async () => {
    vi.stubGlobal(
      'window',
      {
        location: new URL('http://namshub-1.tail9205d3.ts.net:5173/'),
      } as unknown as Window & typeof globalThis,
    )

    vi.resetModules()
    const { api } = await import('./api')

    expect(api.getApiBaseUrl()).toBe('http://namshub-1.tail9205d3.ts.net:8000')
  })

  it('honors VITE_API_BASE_URL when explicitly configured', async () => {
    vi.stubGlobal(
      'window',
      {
        location: new URL('http://namshub-1.tail9205d3.ts.net:5173/'),
      } as unknown as Window & typeof globalThis,
    )

    vi.doMock('./api', async () => {
      const actual = await vi.importActual<typeof import('./api')>('./api')
      return {
        ...actual,
        api: {
          ...actual.api,
          getApiBaseUrl: () => 'https://api.example.test',
        },
      }
    })

    vi.resetModules()
    const { api } = await import('./api')

    expect(api.getApiBaseUrl()).toBe('https://api.example.test')

    vi.doUnmock('./api')
  })
})
