'use strict'

import { Meteor } from 'meteor/meteor'
import { OAuth } from 'meteor/oauth'
import { Accounts } from 'meteor/accounts-base'

import { Auth0Lock } from 'auth0-lock'

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
 
Auth0._loginStyle = function(config, options)  {
  return options.loginStyle === 'inline' && options.lock?.containerId > '' ? 'inline' : OAuth._loginStyle('auth0', config, options)
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
    OAuth._stateParam(loginStyle === 'inline' ? 'redirect' : loginStyle, credentialToken, `${Meteor.absoluteUrl('')}${path}`) +
    // '&connection=facebook' +

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
    lock: options.lock || {}
  })
}

OAuth.startLogin = options => {
  if (!options.loginService) throw new Error('loginService required')

  console.log('OPTIONS', options)
  if (options.loginStyle === 'inline') {
    OAuth.saveDataForRedirect(options.loginService, options.credentialToken)
    
    const isLogin = options.loginType === 'login'
    const isSignup = options.loginType === 'login'

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
      allowedConnections: options.lock.connections || (isSignup && ['Username-Password-Authentication']) || null,
      rememberLastLogin: true,
      languageDictionary: options.lock.languageDictionary,
      theme: {
        logo: options.lock.logo,
        primaryColor: options.lock.primaryColor,
      },
      closable: false,
      container: options.containerId,
      allowLogin: isLogin,
      allowSignUp: isSignup,
    }

    const lock = new Auth0Lock(
      Meteor.settings.public.AUTH0_CLIENT_ID,
      Meteor.settings.public.AUTH0_DOMAIN,
      lockOptions
    )

    lock.show()
  } else {
    OAuth.launchLogin(options)
  }
}
