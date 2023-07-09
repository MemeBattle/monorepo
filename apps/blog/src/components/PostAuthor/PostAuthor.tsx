import Image from 'next/image'

interface PostAuthorProps {
  avatarUrl: string
  username: string
  fullName?: string
  title?: string
}
export function PostAuthor({ username, fullName, avatarUrl, title }: PostAuthorProps) {
  return (
    <div className="rounded-lg shadow p-4 w-full h-20 flex space-x-4">
      <Image className="rounded-full w-12 h-12" width={48} height={48} src={avatarUrl} alt={fullName || username} />
      <div className="overflow-hidden">
        <span>{fullName || username}</span> <br />
        <span className="font-light text-xs">{title}</span>
      </div>
    </div>
  )
}
