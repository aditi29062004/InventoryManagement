
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api/v1'

export async function apiRequest(path, options = {}) {
  const token = localStorage.getItem('accessToken')

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  }

  const requestOptions = {
    ...options,
    headers,
  }

  if (
    options.body !== undefined &&
    options.body !== null &&
    typeof options.body !== 'string'
  ) {
    requestOptions.body = JSON.stringify(options.body)
  }

  const response = await fetch(`${API_BASE_URL}${path}`, requestOptions)

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    const error = new Error(
      data?.error?.message ||
        data?.message ||
        data?.error ||
        `Request failed with status ${response.status}`,
    )

    error.status = response.status
    error.code = data?.error?.code
    throw error
  }

  return data
}
