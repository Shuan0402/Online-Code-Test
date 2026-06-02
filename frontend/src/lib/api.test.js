import { describe, it, expect, beforeEach, vi } from 'vitest'
import api from './api'

// Pull the actual interceptor handlers registered by api.js.
// axios stores them on `interceptors.{request,response}.handlers` —
// each entry has `.fulfilled` and `.rejected`. We test these directly so the
// real interceptor logic runs (no axios mocking).
const requestFulfilled = api.interceptors.request.handlers[0].fulfilled
const responseFulfilled = api.interceptors.response.handlers[0].fulfilled
const responseRejected = api.interceptors.response.handlers[0].rejected

describe('lib/api — request interceptor', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('attaches Bearer token from localStorage when present', () => {
    localStorage.setItem('access_token', 'abc123')
    const config = { headers: {} }

    const result = requestFulfilled(config)

    expect(result.headers['Authorization']).toBe('Bearer abc123')
  })

  it('does not set Authorization header when no token in localStorage', () => {
    const config = { headers: {} }

    const result = requestFulfilled(config)

    expect(result.headers['Authorization']).toBeUndefined()
  })

  it('preserves other headers on the config', () => {
    localStorage.setItem('access_token', 'tok')
    const config = { headers: { 'Content-Type': 'application/json' } }

    const result = requestFulfilled(config)

    expect(result.headers['Content-Type']).toBe('application/json')
    expect(result.headers['Authorization']).toBe('Bearer tok')
  })
})

describe('lib/api — response interceptor', () => {
  let hrefSetter
  let locationStub

  beforeEach(() => {
    localStorage.setItem('access_token', 'old-token')
    localStorage.setItem('user', JSON.stringify({ username: 'jane' }))
    // Stub window.location so we can observe redirects without navigating.
    // Note: we don't call vi.unstubAllGlobals() in afterEach because that
    // would also clear the localStorage stub installed in setup.js.
    hrefSetter = vi.fn()
    locationStub = {
      pathname: '/dashboard',
      get href() { return '' },
      set href(value) { hrefSetter(value) },
    }
    vi.stubGlobal('location', locationStub)
  })

  it('passes successful responses through unchanged', () => {
    const response = { status: 200, data: { ok: true } }
    expect(responseFulfilled(response)).toBe(response)
  })

  it('clears auth state and redirects to /login on 401 when not already there', async () => {
    const error = { response: { status: 401 } }

    await expect(responseRejected(error)).rejects.toBe(error)

    expect(localStorage.getItem('access_token')).toBeNull()
    expect(localStorage.getItem('user')).toBeNull()
    expect(hrefSetter).toHaveBeenCalledWith('/login')
  })

  it('does not redirect on 401 when already on /login', async () => {
    locationStub.pathname = '/login'
    const error = { response: { status: 401 } }

    await expect(responseRejected(error)).rejects.toBe(error)

    // auth state still cleared (idempotent)
    expect(localStorage.getItem('access_token')).toBeNull()
    expect(localStorage.getItem('user')).toBeNull()
    // but no navigation
    expect(hrefSetter).not.toHaveBeenCalled()
  })

  it('passes non-401 errors through without touching auth state', async () => {
    const error = { response: { status: 500, data: { detail: 'server error' } } }

    await expect(responseRejected(error)).rejects.toBe(error)

    expect(localStorage.getItem('access_token')).toBe('old-token')
    expect(localStorage.getItem('user')).toBe(JSON.stringify({ username: 'jane' }))
    expect(hrefSetter).not.toHaveBeenCalled()
  })

  it('passes network errors (no response) through without touching auth state', async () => {
    const error = { message: 'Network Error' }

    await expect(responseRejected(error)).rejects.toBe(error)

    expect(localStorage.getItem('access_token')).toBe('old-token')
    expect(hrefSetter).not.toHaveBeenCalled()
  })
})
