import { parse } from 'qs'

if (window.location.hash) {
  if (window.opener) {
    window.opener.postMessage(parse(window.location.hash.slice(1)), '*')
  } else {
    // eslint-disable-next-line no-console
    console.error('Opener does not exist')
  }
  window.close()
}
