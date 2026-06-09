import axios from 'axios'

// Axios instance — baseURL is '' so all paths go through the Vite proxy.
// The Vite proxy forwards /api/... → http://localhost:8000/api/...
const api = axios.create({
  baseURL: '',
  timeout: 15000,
})

// Request interceptor: attach Bearer token from localStorage if present.
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token')
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Response interceptor: on 401 clear auth state and redirect to /login.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('access_token')
      localStorage.removeItem('user')
      // Use window.location to force a full navigation — avoids stale router state.
      if (globalThis.location.pathname !== '/login') {
        globalThis.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

export default api
