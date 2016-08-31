'use strict';

/**
 * Define the base object namespace. By convention we use the service name
 * in PascalCase (aka UpperCamelCase). Note that this is defined as a package global (boilerplate).
 */
Auth0 = {};
Accounts.oauth.registerService('auth0');


Meteor.loginWithAuth0 = function(options, callback) {  
  /**
   * support (options, callback) and (callback)
   */
  if (!callback && typeof options === "function") {
    callback = options;
    options = null;
  }

  /**
   * 
   */
  var credentialRequestCompleteCallback = Accounts.oauth.credentialRequestCompleteHandler(callback);
  Auth0.requestCredential(options, credentialRequestCompleteCallback);
};

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
    credentialRequestCompleteCallback = options;
    options = {};
  } else if (!options) {
    options = {};
  }

  /**
   * Make sure we have a config object for subsequent use (boilerplate)
   */
  const config = {
    clientId: Meteor.settings.public.AUTH0_CLIENT_ID,
    hostname: Meteor.settings.public.AUTH0_DOMAIN,
    loginStyle: 'redirect',
  };

  /**
   * Boilerplate
   */
  const credentialToken = Random.secret();
  const loginStyle = OAuth._loginStyle('auth0', config, options);

  /**
   * Imgur requires response_type and client_id
   * We use state to roundtrip a random token to help protect against CSRF (boilerplate)
   */
  const loginUrl = `https://${config.hostname}/authorize/` +
    '?response_type=code' +
    '&client_id=' + config.clientId +
    '&state=' + OAuth._stateParam(loginStyle, credentialToken) +
    // '&connection=facebook' +
    
    `&redirect_uri=${Meteor.absoluteUrl('_oauth/auth0')}`
    ;

  /**
   * Client initiates OAuth login request (boilerplate)
  */
  OAuth.launchLogin({
    loginService: 'auth0',
    loginStyle: loginStyle,
    loginUrl: loginUrl,
    credentialRequestCompleteCallback: credentialRequestCompleteCallback,
    credentialToken: credentialToken,
    popupOptions: {
      height: 600
    }
  });
};
