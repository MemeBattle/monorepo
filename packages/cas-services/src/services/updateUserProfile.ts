import { AxiosInstance } from 'axios'
import { CAS_ROUTES } from '../constants'
import { UpdateUserProfilePayload, SuccessUpdateUser, ErrorUpdateUser } from '../types'

export const createUpdateUserProfileService = (request: AxiosInstance) => ({
  userId,
  token,
  avatar,
  username,
}: UpdateUserProfilePayload) => {
  const formData = new FormData()
  if (avatar) {
    formData.append('avatar', avatar)
  }
  if (username) {
    formData.append('username', username)
  }

  return request.patch<SuccessUpdateUser | ErrorUpdateUser, SuccessUpdateUser | ErrorUpdateUser>(
    `${CAS_ROUTES.users}/${userId}`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data', Authorization: token } },
  )
}
