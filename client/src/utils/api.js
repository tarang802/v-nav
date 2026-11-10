import axios from 'axios'

// In local dev (Vite proxy active): VITE_API_URL is empty → baseURL '/api' proxies to localhost:3000
// In production (Vercel static):    VITE_API_URL = 'https://your-railway-app.up.railway.app' → direct
const BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api'

const api = axios.create({
  baseURL: BASE,
  timeout: 10000,
})

// Attach JWT to every request automatically
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('vnav_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Auto-logout on 401
api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('vnav_token')
      localStorage.removeItem('vnav_user')
      window.location.reload()
    }
    return Promise.reject(err)
  }
)

export default api
