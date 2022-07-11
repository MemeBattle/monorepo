import axios from 'axios'

export const request = axios.create({
  baseURL: import.meta.env.VITE_LIGRETTO_CORE_URL,
})
