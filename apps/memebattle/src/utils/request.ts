/* eslint-disable @typescript-eslint/no-empty-interface */
import axios, { AxiosPromise } from 'axios'
import { API_URL, LS_TOKEN_KEY } from '../config'

export interface RequestPromise<T> extends AxiosPromise<T> {}

const request = axios.create({
  baseURL: API_URL,
  headers: {
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

function setJWTHeader(config: any) {
  const newConfig = config

  newConfig.headers.common.Authorization = `${window.localStorage.getItem(LS_TOKEN_KEY)}`

  return newConfig
}

function setJWTInLocalStorage(response: any) {
  if (response.data.data.token) {
    window.localStorage.setItem('key', response.data.data.token)
  }
  return response
}

export default request
