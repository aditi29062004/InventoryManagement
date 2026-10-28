
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api/v1'

export async function apiRequest(path, options = {}) {
  const token = localStorage.getItem('accessToken')

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  })

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    const error = new Error(
      data?.error?.message || `Request failed with status ${response.status}`,
    )

    error.status = response.status
    error.code = data?.error?.code
    throw error
  }

  return data
}
