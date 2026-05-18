import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

/**
 * ProtectedRoute
 *
 * Props:
 *   allowedRoles  — array of role strings that may access this route.
 *                   If omitted, any authenticated user is allowed.
 *   children      — the element(s) to render when auth + role pass.
 *
 * Behaviour:
 *   - While auth context is loading (rehydrating from localStorage), render nothing
 *     to avoid a flash-redirect on page refresh.
 *   - Unauthenticated  → /login
 *   - Wrong role       → /unauthorized
 *   - OK               → children
 */
export default function ProtectedRoute({ allowedRoles, children }) {
  const { user, token, loading } = useAuth()

  if (loading) {
    // Auth state is being resolved from localStorage / /users/me.
    // Return null so there's no premature redirect flash.
    return null
  }

  if (!token || !user) {
    return <Navigate to="/login" replace />
  }

  if (allowedRoles && allowedRoles.length > 0) {
    const userRole = user.role?.toLowerCase()
    const allowed = allowedRoles.map((r) => r.toLowerCase())
    if (!allowed.includes(userRole)) {
      return <Navigate to="/unauthorized" replace />
    }
  }

  return children
}
