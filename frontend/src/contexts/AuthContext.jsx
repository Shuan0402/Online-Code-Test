import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from 'react'
import api from '@/lib/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [token, setToken] = useState(
    () => localStorage.getItem('access_token') || null,
  )
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('user')
      return stored ? JSON.parse(stored) : null
    } catch {
      return null
    }
  })
  const [loading, setLoading] = useState(true)

  // On mount: if we have a token, try to rehydrate the user from /users/me.
  // NOTE: GET /api/v1/users/me does not exist on the backend yet (per plan).
  // We handle 404 gracefully — keep the locally-stored user object as fallback.
  useEffect(() => {
    const storedToken = localStorage.getItem('access_token')
    if (!storedToken) {
      setLoading(false)
      return
    }
    api
      .get('/api/v1/users/me')
      .then((res) => {
        setUser(res.data)
        localStorage.setItem('user', JSON.stringify(res.data))
      })
      .catch((err) => {
        const status = err.response?.status
        if (status === 404) {
          // Backend endpoint not yet shipped — use the cached user from localStorage.
          console.warn(
            '[AuthContext] GET /api/v1/users/me returned 404 (endpoint not yet deployed). Using cached user from localStorage.',
          )
        } else if (status === 401) {
          // Token invalid/expired — clear everything.
          setToken(null)
          setUser(null)
          localStorage.removeItem('access_token')
          localStorage.removeItem('user')
        } else {
          console.error(
            '[AuthContext] Failed to rehydrate session:',
            err.message,
          )
        }
      })
      .finally(() => setLoading(false))
  }, [])

  /**
   * login — called by LoginPage after receiving the token from POST /api/v1/auth/login.
   * Stores the token, fetches /users/me (with 404 fallback), returns the user object.
   */
  const login = useCallback(async (accessToken, fallbackUser = null) => {
    localStorage.setItem('access_token', accessToken)
    setToken(accessToken)

    try {
      const res = await api.get('/api/v1/users/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const userData = res.data
      setUser(userData)
      localStorage.setItem('user', JSON.stringify(userData))
      return userData
    } catch (err) {
      const status = err.response?.status
      if (status === 404 && fallbackUser) {
        // /users/me not yet available — use whatever the LoginPage decoded / passed.
        console.warn(
          '[AuthContext] GET /api/v1/users/me → 404; using fallback user object.',
        )
        setUser(fallbackUser)
        localStorage.setItem('user', JSON.stringify(fallbackUser))
        return fallbackUser
      }
      // Propagate other errors back to LoginPage for display.
      throw err
    }
  }, [])

  /**
   * logout — calls POST /auth/logout to blacklist token server-side, then clears auth state.
   * Fire-and-forget on the network call: even if it fails, we still clear the client.
   */
  const logout = useCallback(async () => {
    try {
      await api.post('/api/v1/auth/logout')
    } catch {
      // Token may already be invalid or backend unreachable — clear locally regardless.
    }
    setToken(null)
    setUser(null)
    localStorage.removeItem('access_token')
    localStorage.removeItem('user')
    window.location.href = '/login'
  }, [])

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
