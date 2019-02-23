import axios from 'axios'
import { BASE_URL, APPLICATION_API_KEY, JWT_PREFIX } from '../config'

const request = axios.create({
  baseURL: BASE_URL || 'http://localhost:5000',
  headers: {
    'X-Application-Key': APPLICATION_API_KEY,
    'Content-Type': 'application/json',
  },
})

/**
 * Request interceptor for setting JWT to request header
 */
request.interceptors.request.use(setJWTHeader)

/**
 * Response interceptor for setting JWT to LocalStorage
 */
request.interceptors.response.use(setJWTInLocalStorage)

function setJWTHeader(config) {
  const newConfig = config

  newConfig.headers.common.Authorization = `${JWT_PREFIX} ${window.localStorage.getItem('key')}`

  return newConfig
}

function setJWTInLocalStorage(response) {
  if (response.data.data.token) {
    window.localStorage.setItem('key', response.data.data.token)
  }
  return response
}

export default request
