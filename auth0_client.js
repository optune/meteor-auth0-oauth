'use strict'

import { Meteor } from 'meteor/meteor'
import { OAuth } from 'meteor/oauth'
import { Accounts } from 'meteor/accounts-base'

const KEY_NAME = 'Meteor_Reload'

/**
 * Define the base object namespace. By convention we use the service name
 * in PascalCase (aka UpperCamelCase). Note that this is defined as a package global (boilerplate).
 */

Auth0 = {
  lock: undefined,
}

Accounts.oauth.registerService('auth0')

Meteor.loginWithAuth0 = function (options, callback) {
  /**
   * support (options, callback) and (callback)
   */
  if (!callback && typeof options === 'function') {
    callback = options
    options = null
  }

  /**
   *
   */
  var credentialRequestCompleteCallback = Accounts.oauth.credentialRequestCompleteHandler(callback)
  Auth0.requestCredential(options, credentialRequestCompleteCallback)
}

/**
 * Determine login style inclusive support for inline auth0 lock
 */

Auth0._loginStyle = function (config, options) {
  return options.loginStyle === 'inline' ? 'inline' : OAuth._loginStyle('auth0', config, options)
}

Auth0._rootUrl = function (options) {
  let redirectUrl = Meteor.absoluteUrl('')

  if (options.rootUrl > '') {
    redirectUrl = options.rootUrl.endsWith('/') ? options.rootUrl : `${options.rootUrl}/`
  }

  return redirectUrl
}

/**
 * Request Auth0 credentials for the user (boilerplate).
 * Called from accounts-auth0.
 *
 * @param {Object}    options                             Optional
 * @param {Function}  credentialRequestCompleteCallback   Callback function to call on completion.
 *                                                        Takes one argument, credentialToken on
 *                                                        success, or Error on error.
 */

Auth0.requestCredential = function (options, credentialRequestCompleteCallback) {
  /**
   * Support both (options, callback) and (callback).
   */
  if (!credentialRequestCompleteCallback && typeof options === 'function') {
    credentialRequestCompleteCallback = options
    options = {}
  } else if (!options) {
    options = {}
  }

  /**
   * Make sure we have a config object for subsequent use (boilerplate)
   */
  const config = {
    clientId: Meteor.settings.public.AUTH0_CLIENT_ID,
    hostname: Meteor.settings.public.AUTH0_DOMAIN,
    clientConfigurationBaseUrl:
      Meteor.settings.public.AUTH0_CLIENT_CONFIG_BASE_URL || 'https://cdn.eu.auth0.com/',
    loginStyle: 'redirect',
  }

  /**
   * Boilerplate
   */

  // Create one-time credential secret token
  const credentialToken = Random.secret()

  // Detemines the login style
  const loginStyle = Auth0._loginStyle(config, options)
  const rootUrl = Auth0._rootUrl(options)
  const redirectUrl = `${rootUrl}_oauth/auth0`

  // Determine path
  let path = options.path || ''
  path = path.startsWith('/') ? path.substring(1) : path
  const callbackUrl = `${rootUrl}${path}`

  /**
   * Imgur requires response_type and client_id
   * We use state to roundtrip a random token to help protect against CSRF (boilerplate)
   */

  let loginUrl =
    `https://${config.hostname}/authorize/` +
    '?scope=openid%20profile%20email' +
    '&response_type=code' +
    '&client_id=' +
    config.clientId +
    '&state=' +
    OAuth._stateParam(
      loginStyle === 'inline' ? 'redirect' : loginStyle,
      credentialToken,
      callbackUrl
    ) +
    `&redirect_uri=${redirectUrl}`

  if (options.type) {
    loginUrl = loginUrl + '#' + options.type
  }

  /**
   * Client initiates OAuth login request (boilerplate)
   */
  Oauth.startLogin({
    clientConfigurationBaseUrl: config.clientConfigurationBaseUrl,
    loginService: 'auth0',
    loginStyle,
    loginUrl,
    loginPath: path,
    loginType: options.type,
    redirectUrl,
    callbackUrl,
    credentialRequestCompleteCallback,
    credentialToken,
    popupOptions: {
      height: 600,
    },
    lock: options.lock || {},
  })
}

OAuth.startLogin = async (options) => {
  if (!options.loginService) throw new Error('login service required')

  if (options.loginStyle === 'inline') {
    OAuth.saveDataForRedirect(options.loginService, options.credentialToken)

    const isLogin = options.loginType === 'login'
    const isSignup = options.loginType === 'signup'

    const lockOptions = {
      configurationBaseUrl: options.clientConfigurationBaseUrl,
      auth: {
        redirectUrl: options.redirectUrl,
        params: {
          state: OAuth._stateParam('redirect', options.credentialToken, options.callbackUrl),
        },
      },
      allowedConnections:
        options.lock.connections || (isSignup && ['Username-Password-Authentication']) || null,
      rememberLastLogin: true,
      languageDictionary: options.lock.languageDictionary,
      theme: {
        logo: options.lock.logo,
        primaryColor: options.lock.primaryColor,
      },
      closable: true,
      container: options.lock.containerId,
      allowLogin: isLogin,
      allowSignUp: isSignup,
      signUpFieldsStrictValidation: true, // From email validation issue: https://github.com/auth0/lock/issues/1919
    }

    // Close (destroy) previous lock instance
    OAuth.closeLock(options)

    const { Auth0Lock } = await import('auth0-lock')

    // Create and configure new auth0 lock instance
    OAuth.lock = new Auth0Lock(
      Meteor.settings.public.AUTH0_CLIENT_ID,
      Meteor.settings.public.AUTH0_DOMAIN,
      lockOptions
    )

    // Check for active login session in Auth0 (silent autentication)
    OAuth.lock.checkSession(
      {
        responseType: 'token',
      },
      (error, result) => {
        if (error) {
          console.log('👹 SILENT AUTHENTICATION FAILED --> Log in required')
          // Show lock on error as user needs to sign in again
          OAuth.lock.on('hide', () => {
            window.history.replaceState({}, document.title, '.')
          })

          // Show lock
          OAuth.lock.show()
        } else {
          // Authenticate the user for the application
          console.log('✅ SILENT AUTENTICATION SUCCESSFUL --> Redirect to application')
          console.log('AUTH0 RESULT', result)
          const accessTokenQuery = new URLSearchParams(result)
          const loginUrl =
            options.redirectUrl +
            '?' +
            accessTokenQuery +
            '&type=token' +
            '&state=' +
            OAuth._stateParam('popup', options.credentialToken)
          console.log('Login URL', loginUrl)

          // Launch pop up with redirect url to oauth/auth0 path to login in without reloading the page
          // OAuth.launchLogin({
          //   loginStyle: 'popup',
          //   loginUrl,
          //   credentialToken: options.credentialToken,
          //   popupOptions: {
          //     width: 1,
          //     height: 1,
          //   },
          //   credentialRequestCompleteCallback: options.credentialRequestCompleteCallback,
          // })
        }
      }
    )
  } else {
    OAuth.launchLogin(options)
  }
}

OAuth.closeLock = (options = {}) => {
  OAuth.lock = undefined

  if (options.lock && options.lock.containerId > '') {
    // Get the container element
    var container = document.getElementById(options.lock.containerId)

    // As long as <ul> has a child node, remove it
    if (container && container.hasChildNodes()) {
      container.removeChild(container.firstChild)
    }
  }
}

// Get cookie if external login
function getCookie(name) {
  // Split cookie string and get all individual name=value pairs in an array
  var cookieArr = document.cookie.split(';')

  // Loop through the array elements
  for (var i = 0; i < cookieArr.length; i++) {
    var cookiePair = cookieArr[i].split('=')

    /* Removing whitespace at the beginning of the cookie name
        and compare it with the given string */
    if (name == cookiePair[0].trim()) {
      // Decode the cookie value and return
      return JSON.parse(decodeURIComponent(cookiePair[1]))
    }
  }

  // Return null if not found
  return null
}

const cookieMigrationData = getCookie(KEY_NAME)
if (cookieMigrationData) {
  document.cookie = KEY_NAME + '=; max-age=0'
}

// Overwrite getDataAfterRedirect to attempt to get oauth login data from cookie if session storage is empty
OAuth.getDataAfterRedirect = () => {
  let migrationData = Reload._migrationData('oauth')

  // Check for migration data in cookie
  if (!migrationData && cookieMigrationData) {
    migrationData = cookieMigrationData.oauth
  }

  if (!(migrationData && migrationData.credentialToken)) return null

  const { credentialToken } = migrationData
  const key = OAuth._storageTokenPrefix + credentialToken
  let credentialSecret

  try {
    credentialSecret = sessionStorage.getItem(key)
    // sessionStorage.removeItem(key);
  } catch (e) {
    Meteor._debug('error retrieving credentialSecret', e)
  }

  return {
    loginService: migrationData.loginService,
    credentialToken,
    credentialSecret,
  }
}
