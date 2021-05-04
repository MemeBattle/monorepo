import { useToken } from '../../hooks/useToken'
import { useCasServices } from '../../modules/cas-services'
import { useEffect, useState } from 'react'

export const useProfileRequest = () => {
  const token = useToken() ?? ''
  const { getMeService } = useCasServices()

  const [isProfileLoading, setIsProfileLoading] = useState(true)
  const [profile, setProfile] = useState<{ id: string; email: string; username: string; token: string; avatarUrl?: string } | null>(null)

  useEffect(() => {
    const getProfile = async () => {
      try {
        const response = await getMeService({ token })

        if (response.success) {
          setProfile({
            id: response.data.user._id,
            username: response.data.user.username,
            email: response.data.user.email,
            token,
          })
          setIsProfileLoading(false)
        }
      } catch (e) {
        console.log(e)
      }
    }

    getProfile()
  }, [token, setIsProfileLoading, getMeService])

  return [profile, isProfileLoading] as const
}
