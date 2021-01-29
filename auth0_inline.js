// Browser specific code for the OAuth package.
import { Meteor } from 'meteor/meteor'
import { Accounts } from 'meteor/accounts-base'
import { OAuth } from 'meteor/oauth'

export const Auth0Inline = { lock: undefined }

const getOrigin = rootUrl => {
  return rootUrl.endsWith('/') ? rootUrl.substr(0, rootUrl.length - 1) : rootUrl
}

Auth0Inline.showLock = async options => {
  OAuth.saveDataForRedirect(options.loginService, options.credentialToken)

  const isLogin = options.loginType === 'login'
  const isSignup = options.loginType === 'signup'
  const nonce = Random.secret()
  const params = {
    state: OAuth._stateParam('redirect', options.credentialToken, options.callbackUrl),
    scope: 'openid profile email',
  }

  const lockOptions = {
    configurationBaseUrl: options.clientConfigurationBaseUrl,
    auth: {
      redirect: false,
      responseType: 'token id_token',
      params,
      nonce,
      sso: true,
    },
    allowedConnections:
      options.lock.connections || (isSignup && ['Username-Password-Authentication']) || null,
    rememberLastLogin: true,
    languageDictionary: options.lock.languageDictionary,
    theme: {
      logo: options.lock.logo,
      primaryColor: options.lock.primaryColor,
    },
    avatar: null,
    closable: true,
    container: options.lock.containerId,
    allowLogin: isLogin,
    allowSignUp: isSignup,
  }

  // Close (destroy) previous lock instance
  Auth0Inline.closeLock(options)

  const { Auth0Lock } = await import('auth0-lock')

  // Create and configure new auth0 lock instance
  Auth0Inline.lock = new Auth0Lock(
    Meteor.settings.public.AUTH0_CLIENT_ID,
    Meteor.settings.public.AUTH0_DOMAIN,
    lockOptions
  )

  // Authenticate the user in Meteor
  Auth0Inline.lock.on('authenticated', result => {
    Auth0Inline.onAuthenticated(result, options)
  })

  // Check for active login session in Auth0 (silent autentication)
  Auth0Inline.lock.checkSession(
    {
      responseType: 'token id_token',
      nonce,
    },
    (error, result) => {
      if (error) {
        // Show lock on error as user needs to sign in again
        Auth0Inline.lock.on('hide', () => {
          window.history.replaceState({}, document.title, '.')
        })

        // Show lock
        Auth0Inline.lock.show()
      } else {
        // Authenticate the user in Meteor
        Auth0Inline.onAuthenticated(result, options)
      }
    }
  )
}

Auth0Inline.onAuthenticated = (result, options) => {
  console.log('AUTHENTICATED', result.accessToken)

  options.authenticatedCallback?.()

  // Get lock container element
  const lockContainer = document.getElementById(options.lock.containerId)
  let iFrame

  if (lockContainer) {
    /*
     * Add message event listener for auth0 response from iFrame
     */

    // window.addEventListener(
    //   'message',
    //   event => {
    //     if (event.data.type === 'AUTH0_RESPONSE') {
    //       lockContainer.removeChild(iFrame)

    //       const origin = getOrigin(options.rootUrl || Meteor.absoluteUrl(''))

    //       if (event.origin === origin) {
    //         const { credentialSecret, credentialToken } = event.data

    //         Accounts.callLoginMethod({
    //           methodArguments: [{ oauth: { credentialToken, credentialSecret } }],
    //           userCallback: options.callback && (err => options.callback(convertError(err))),
    //         })
    //       } else {
    //         // Log missmatching origin
    //       }
    //     }
    //   },
    //   false
    // )

    /*
     * Add iframe with autentication url for Meteor
     */

    // Authenticate the user for the application
    const accessTokenQueryData = {
      access_token: result.accessToken,
      refresh_token: result.refreshToken,
      expires_in: result.expiresIn,
      state: result.state,
      type: 'token',
    }
    const accessTokenQuery = new URLSearchParams(accessTokenQueryData)

    const iFrameSourceUrl = options.redirectUrl + '?' + accessTokenQuery
    console.log('REDIRECT URL', iFrameSourceUrl)
    iFrame = document.createElement('iframe')
    iFrame.setAttribute('src', iFrameSourceUrl)
    iFrame.setAttribute('width', '0')
    iFrame.setAttribute('height', '0')
    lockContainer.appendChild(iFrame)

    // Remove login or signup hash from url
    window.history.replaceState({}, document.title, '.')
  }
}

Auth0Inline.closeLock = (options = {}) => {
  Auth0Inline.lock = undefined

  if (options.lock && options.lock.containerId > '') {
    // Get the container element
    const lockContainer = document.getElementById(options.lock.containerId)

    // As long as <ul> has a child node, remove it
    if (lockContainer && lockContainer.hasChildNodes()) {
      lockContainer.removeChild(lockContainer.firstChild)
    }
  }
}
