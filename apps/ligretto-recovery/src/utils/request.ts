import axios from 'axios'

export const request = axios.create({
  baseURL: process.env.REACT_APP_LIGRETTO_RECOVERY_URL,
})
