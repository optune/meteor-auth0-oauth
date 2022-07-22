import { Meteor } from 'meteor/meteor'
import { OAuth } from 'meteor/oauth'
import { Accounts } from 'meteor/accounts-base'

import { showInlineLoginForm } from './oauth_inline_browser'

const KEY_NAME = 'Meteor_Reload'

export const OAuthInline = {
  showInlineLoginForm,
}

/*
 * Overwrite OAuth._loginStyle: Determine the login style (popup, inline or redirect as default) for this login flow.
 */

OAuth._loginStyle = (service, config, options) => {
  if (Meteor.isCordova) {
    return 'popup'
  }

  let loginStyle = (options && options.loginStyle) || config.loginStyle || 'popup'

  if (!['popup', 'redirect', 'inline'].includes(loginStyle))
    throw new Error(`Invalid login style: ${loginStyle}`)

  // If we don't have session storage (for example, Safari in private
  // mode), the redirect login flow won't work, so fallback to the
  // popup style.
  if (loginStyle === 'redirect') {
    try {
      sessionStorage.setItem('Meteor.oauth.test', 'test')
      sessionStorage.removeItem('Meteor.oauth.test')
    } catch (e) {
      loginStyle = 'popup'
    }
  }

  return loginStyle
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

// Overwrite OAuth.getDataAfterRedirect: attempt to get oauth login data from cookie if session storage is empty
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
    sessionStorage.removeItem(key)
  } catch (e) {
    Meteor._debug('error retrieving credentialSecret', e)
  }

  return {
    loginService: migrationData.loginService,
    credentialToken,
    credentialSecret,
  }
}
