// NOTE: This file is added to the client as asset and hence ecmascript package has no effect here.
Auth0Inline = {
  lock: undefined,
}

// function getStateParam(loginStyle, credentialToken) {
//   var state = {
//     loginStyle,
//     credentialToken,
//   }

//   // Encode base64 as not all login services URI-encode the state
//   // parameter when they pass it back to us.
//   // Use the 'base64' package here because 'btoa' isn't supported in IE8/9.
//   return Base64.encode(JSON.stringify(state))
// }

Auth0Inline.closeLock = function(containerId) {
  Auth0Inline.lock = undefined

  if (containerId > '') {
    // Get the container element
    var container = document.getElementById(containerId)

    // As long as <ul> has a child node, remove it
    if (container && container.hasChildNodes()) {
      container.removeChild(container.firstChild)
    }
  }
}

Auth0Inline.launchLock = function({ containerId, config }) {
  // var { credentialToken, loginType, lock, redirectUrl, state, nonce, loginPath } = config

  console.log('lauched lock inline')
  if (config.credentialToken) {
    var isLogin = config.loginType === 'login'
    var isSignup = config.loginType === 'signup'
    var nonce = config.nonce
    var params = {
      state: config.state,
      scope: 'openid profile email',
    }

    // Set lock options
    var lockOptions = {
      configurationBaseUrl: config.settings.AUTH0_CLIENT_CONFIG_BASE_URL,
      auth: {
        redirectUrl: config.redirectUrl,
        params,
        nonce,
        sso: true,
      },
      allowedConnections:
        config.lock.connections || (isSignup && ['Username-Password-Authentication']) || null,
      rememberLastLogin: true,
      languageDictionary: config.lock.languageDictionary,
      theme: {
        logo: config.lock.logo,
        primaryColor: config.lock.primaryColor,
      },
      avatar: null,
      closable: true,
      container: containerId,
      allowLogin: isLogin,
      allowSignUp: isSignup,
    }

    // Close (destroy) previous lock instance
    Auth0Inline.closeLock(containerId)

    // Create and configure new auth0 lock instance
    Auth0Inline.lock = new Auth0Lock(
      config.settings.AUTH0_CLIENT_ID,
      config.settings.AUTH0_DOMAIN,
      lockOptions
    )

    // Check for active login session in Auth0 (silent autentication)
    Auth0Inline.lock.checkSession(
      {
        responseType: 'token id_token',
        nonce,
      },
      function(error, result) {
        if (error) {
          // Show lock on error as user needs to sign in again
          Auth0Inline.lock.on('hide', function() {
            window.history.replaceState({}, document.title, '.')
          })

          // Show lock
          Auth0Inline.lock.show()
        } else {
          // Authenticate the user for the application
          const accessTokenQueryData = {
            access_token: result.accessToken,
            refresh_token: result.refreshToken,
            expires_in: result.expiresIn,
          }
          const accessTokenQuery = new URLSearchParams(accessTokenQueryData)
          const loginUrl =
            config.redirectUrl + '?' + accessTokenQuery + '&type=token' + '&state=' + config.state

          window.location.href = loginUrl
        }
      }
    )
  }
}
