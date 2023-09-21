import axios from 'axios'
import { LIGRETTO_CORE_URL } from 'shared/constants/config'

export const request = axios.create({
  baseURL: LIGRETTO_CORE_URL,
})
