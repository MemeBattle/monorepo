import { parse } from 'qs'

if (window.location.hash) {
  if (window.opener) {
    window.opener.postMessage(parse(window.location.hash.slice(1)), '*')
  } else {
    console.error('Opener does not exist') // tslint:disable-line: no-console
  }
  window.close()
}
