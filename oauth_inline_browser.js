// Browser specific code for the OAuth package.
import { Meteor } from 'meteor/meteor'
import { Accounts } from 'meteor/accounts-base'
import { OAuth } from 'meteor/oauth'

const getOrigin = rootUrl => {
  return rootUrl.endsWith('/') ? rootUrl.substr(0, rootUrl.length - 1) : rootUrl
}

// Allow server to specify a specify subclass of errors. We should come
// up with a more generic way to do this!
const convertError = err => {
  if (err && err instanceof Meteor.Error && err.error === Accounts.LoginCancelledError.numericError)
    return new Accounts.LoginCancelledError(err.reason)
  else return err
}

// Adds an iframe to the container and shows the auth0 lock
//
// @param options
//   - lock: Options for lock,
//   - redirectUrl: Url to redirect the auth0 login to,
//   - loginType: Login type ('login', 'signup'),
//   - rootUrl: Application root url (normally retrieved from Meteor.absoluteUrl),
//   - state: State param for security check,
export const showInlineLoginForm = options => {
  const loginElement = document.getElementById(options.lock.containerId)
  let iFrame

  if (loginElement) {
    /*
     * Add message event listener for auth0 response from iFrame
     */

    window.addEventListener(
      'message',
      event => {
        if (event.data.type === 'AUTH0_RESPONSE') {
          loginElement.removeChild(iFrame)

          const origin = getOrigin(options.rootUrl || Meteor.absoluteUrl(''))

          if (event.origin === origin) {
            const { credentialSecret, credentialToken } = event.data

            Accounts.callLoginMethod({
              methodArguments: [{ oauth: { credentialToken, credentialSecret } }],
              userCallback: options.callback && (err => options.callback(convertError(err))),
            })
          } else {
            // Log missmatching origin
          }
        }
      },
      false
    )

    /*
     * Add iframe
     */

    const iFrameOptions = {
      credentialToken: options.credentialToken,
      lock: JSON.stringify(options.lock),
      loginType: options.loginType,
      state: options.state,
    }
    const iFrameQuery = Object.keys(iFrameOptions)
      .map(key => `${key}=${encodeURIComponent(iFrameOptions[key])}`)
      .join('&')
    const iFrameSourceUrl = options.rootUrl + '_oauth_inline/auth0/form?' + iFrameQuery
    iFrame = document.createElement('iframe')
    iFrame.setAttribute('src', iFrameSourceUrl)
    iFrame.classList.add(options.lock.containerId + '__widget')
    iFrame.setAttribute('width', '100%')
    iFrame.setAttribute('height', '100%')
    loginElement.appendChild(iFrame)
  }
}
