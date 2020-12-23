'use strict'

import { Meteor } from 'meteor/meteor'
import { OAuth } from 'meteor/oauth'
import { Accounts } from 'meteor/accounts-base'

import { OAuthInline } from './oauth_inline_client'

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

  options.callback = callback

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
  let rootUrl = Meteor.absoluteUrl('')

  if (options.rootUrl > '') {
    rootUrl = options.rootUrl.endsWith('/') ? options.rootUrl : `${options.rootUrl}/`
  }

  return rootUrl
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

  const state = OAuth._stateParam(
    loginStyle,
    credentialToken,
    callbackUrl
  )

  let loginUrl =
    `https://${config.hostname}/authorize/` +
    '?scope=openid%20profile%20email' +
    '&response_type=code' +
    '&client_id=' +
    config.clientId +
    '&state=' +
    state +
    `&redirect_uri=${redirectUrl}`

  if (options.type) {
    loginUrl = loginUrl + '#' + options.type
  }

  /**
   * Client initiates OAuth login request (boilerplate)
   */
  Auth0.startLogin({
    clientConfigurationBaseUrl: config.clientConfigurationBaseUrl,
    loginService: 'auth0',
    loginStyle,
    loginUrl,
    loginPath: path,
    loginType: options.type,
    redirectUrl,
    callbackUrl,
    callback: options.callback,
    credentialRequestCompleteCallback,
    credentialToken,
    rootUrl,
    state,
    popupOptions: {
      height: 600,
    },
    lock: options.lock || {},
  })
}

Auth0.startLogin = (options) => {
  if (!options.loginService) throw new Error('login service required')

  if (options.loginStyle === 'inline') {
    OAuthInline.showInlineLoginForm(options)
  } else {
    OAuth.launchLogin(options)
  }
}

Auth0.closeLock = (options = {}) => {
  Auth0.lock = undefined

  if (options.lock && options.lock.containerId > '') {
    // Get the container element
    var container = document.getElementById(options.lock.containerId)

    // As long as <ul> has a child node, remove it
    if (container && container.hasChildNodes()) {
      container.removeChild(container.firstChild)
    }
  }
}


