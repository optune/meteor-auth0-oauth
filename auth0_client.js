'use strict'

import { Meteor } from 'meteor/meteor'
import { OAuth } from 'meteor/oauth'
import { Accounts } from 'meteor/accounts-base'

import { Auth0Lock } from 'auth0-lock'

const KEY_NAME = 'Meteor_Reload'

/**
 * Define the base object namespace. By convention we use the service name
 * in PascalCase (aka UpperCamelCase). Note that this is defined as a package global (boilerplate).
 */

Auth0 = {}

Accounts.oauth.registerService('auth0')

Meteor.loginWithAuth0 = function(options, callback) {
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

Auth0._loginStyle = function(config, options) {
  return options.loginStyle === 'inline' ? 'inline' : OAuth._loginStyle('auth0', config, options)
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

Auth0.requestCredential = function(options, credentialRequestCompleteCallback) {
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
    loginStyle: 'redirect',
  }

  /**
   * Boilerplate
   */

  // Create one-time credential secret token
  const credentialToken = Random.secret()

  // Detemines the login style
  const loginStyle = Auth0._loginStyle(config, options)

  // Determine path
  let path = options.path || ''
  path = path.startsWith('/') ? path.substring(1) : path

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
      `${Meteor.absoluteUrl('')}${path}`
    ) +
    // // '&connection=facebook' +

    `&redirect_uri=${Meteor.absoluteUrl('_oauth/auth0')}`

  if (options.type) {
    loginUrl = loginUrl + '#' + options.type
  }

  /**
   * Client initiates OAuth login request (boilerplate)
   */
  Oauth.startLogin({
    loginService: 'auth0',
    loginStyle,
    loginUrl,
    loginPath: path,
    loginDomain: Meteor.absoluteUrl(''),
    loginType: options.type,
    credentialRequestCompleteCallback,
    credentialToken,
    popupOptions: {
      height: 600,
    },
    lock: options.lock || {},
  })
}

OAuth.startLogin = options => {
  if (!options.loginService) throw new Error('loginService required')

  if (options.loginStyle === 'inline') {
    OAuth.saveDataForRedirect(options.loginService, options.credentialToken)

    const isLogin = options.loginType === 'login'
    const isSignup = options.loginType === 'signup'

    const lockOptions = {
      auth: {
        redirectUrl: Meteor.absoluteUrl('_oauth/auth0'),
        params: {
          state: OAuth._stateParam(
            'redirect',
            options.credentialToken,
            `${Meteor.absoluteUrl('')}${options.loginPath}`
          ),
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
      closable: false,
      container: options.lock.containerId,
      allowLogin: isLogin,
      allowSignUp: isSignup,
    }

    const lock = new Auth0Lock(
      Meteor.settings.public.AUTH0_CLIENT_ID,
      Meteor.settings.public.AUTH0_DOMAIN,
      lockOptions
    )

    // lock.checkSession(
    //   {
    //     responseType: 'token',
    //   },
    //   (error, result) => {
    //     if (error) {
    //       console.log('CHECK RESULT ERROR', error)
    //     } else {
    //       console.log('CHECK RESULT', result)
    //       window.location = `${Meteor.absoluteUrl('_oauth/auth0')}?state=${OAuth._stateParam(
    //         'redirect',
    //         options.credentialToken,
    //         `${Meteor.absoluteUrl('')}${options.loginPath}`
    //       )}`
    //     }
    //   }
    // )

    lock.show()
  } else {
    OAuth.launchLogin(options)
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
