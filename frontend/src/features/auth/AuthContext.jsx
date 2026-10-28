
import {
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react'
import { apiRequest } from '../../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(() =>
    localStorage.getItem('accessToken'),
  )
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function restoreSession() {
      const savedToken = localStorage.getItem('accessToken')

      if (!savedToken) {
        if (!cancelled) {
          setUser(null)
          setToken(null)
          setLoading(false)
        }
        return
      }

      try {
        const response = await apiRequest('/auth/me')

        if (!cancelled) {
          setUser(response.data.user)
          setToken(savedToken)
        }
      } catch (error) {
        if (!cancelled) {
          localStorage.removeItem('accessToken')
          setUser(null)
          setToken(null)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    restoreSession()

    return () => {
      cancelled = true
    }
  }, [])

  async function login(email, password) {
    const response = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })

    const { user: loggedInUser, accessToken } = response.data

    localStorage.setItem('accessToken', accessToken)
    setToken(accessToken)
    setUser(loggedInUser)
    setLoading(false)

    return loggedInUser
  }

  async function register(name, email, password) {
    const response = await apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    })

    const { user: registeredUser, accessToken } = response.data

    localStorage.setItem('accessToken', accessToken)
    setToken(accessToken)
    setUser(registeredUser)
    setLoading(false)

    return registeredUser
  }

  function logout() {
    localStorage.removeItem('accessToken')
    setToken(null)
    setUser(null)
    setLoading(false)
  }

  const value = {
    user,
    token,
    loading,
    login,
    register,
    logout,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }

  return context
}
