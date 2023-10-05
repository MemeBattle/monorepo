export function InstagramPostFallback({ publicationId, description }: { publicationId: string; description: string }) {
  return `<p>
    <a href="https://www.instagram.com/p/${publicationId}" target="_blank">
      ${description}. View this post on Instagram.
    </a>
  </p>`
}
