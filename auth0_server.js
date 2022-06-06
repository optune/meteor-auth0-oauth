import { Meteor } from 'meteor/meteor'
import { Accounts } from 'meteor/accounts-base'
import { OAuth } from 'meteor/oauth'
import { fetch, Headers } from 'meteor/fetch'

import { OAuthInline } from './oauth_inline_server'

/**
 * Define the base object namespace. By convention we use the service name
 * in PascalCase (aka UpperCamelCase). Note that this is defined as a package global.
 */

Auth0 = {}

Auth0.whitelistedFields = ['id', 'email', 'picture', 'name']

Accounts.oauth.registerService('auth0')

Accounts.addAutopublishFields({
  /**
   * Logged in user gets whitelisted fields + accessToken + expiresAt.
   */
  forLoggedInUser: Auth0.whitelistedFields
    .concat(['accessToken', 'expiresAt'])
    .map(subfield => 'services.auth0.' + subfield), // don't publish refresh token

  /**
   * Other users get whitelisted fields without emails, because even with
   * autopublish, no legitimate web app should be publishing all users' emails.
   */
  forOtherUsers: Auth0.whitelistedFields
    .filter(field => !['email', 'verified_email'].includes(field))
    .map(subfield => 'services.auth0.' + subfield),
})

// Insert a configuration-stub into the database. All the config should be configured
// via settings.json
Meteor.startup(() => {
  ServiceConfiguration.configurations.upsert(
    { service: 'auth0' },
    {
      $set: {
        _configViaSettings: true,
      },
    }
  )
})

const getToken = function(authResponse) {
  return {
    accessToken: authResponse.access_token,
    refreshToken: authResponse.refresh_token,
    expiresIn: authResponse.expires_in,
    username: authResponse.account_username,
  }
}

/**
 * Boilerplate hook for use by underlying Meteor code
 */
Auth0.retrieveCredential = (credentialToken, credentialSecret) => {
  return OAuth.retrieveCredential(credentialToken, credentialSecret)
}

/**
 * Register this service with the underlying OAuth handler
 * (name, oauthVersion, urls, handleOauthRequest):
 *  name = 'imgur'
 *  oauthVersion = 2
 *  urls = null for OAuth 2
 *  handleOauthRequest = function(query) returns {serviceData, options} where options is optional
 * serviceData will end up in the user's services.imgur
 */

OAuthInline.registerService('auth0', 2, null, query => {
  /**
   * Make sure we have a config object for subsequent use (boilerplate)
   */
  const config = {
    clientId: Meteor.settings.public.AUTH0_CLIENT_ID,
    secret: Meteor.settings.private.AUTH0_CLIENT_SECRET,
    hostname: Meteor.settings.public.AUTH0_DOMAIN,
    loginStyle: 'redirect',
  }

  /**
   * Get the token and username (Meteor handles the underlying authorization flow).
   * Note that the username comes from from this request in Imgur.
   */
  // const getTokensSync = Meteor.wrapAsync(getTokens)
  let response

  if (query.type === 'token') {
    response = getToken(query)
  } else {
    tokenData = getTokens(config, query)

    if (tokenData.error) {
      /**
       * The http response was a json object with an error attribute
       */
      throw new Error(`Failed to complete OAuth handshake with Auth0. ${tokenData.error}`)
    } else {
      /** The exchange worked. We have an object containing
       *   access_token
       *   refresh_token
       *   expires_in
       *   token_type
       *   account_username
       *
       * Return an appropriately constructed object
       */
      response = getToken(tokenData)
    }
  }
  const accessToken = response.accessToken
  const username = response.username

  /**
   * If we got here, we can now request data from the account endpoints
   * to complete our serviceData request.
   * The identity object will contain the username plus *all* properties
   * retrieved from the account and settings methods.
   */

  const account = getAccount(config, accessToken)
  const identity = { username, ...account }

  /**
   * Build our serviceData object. This needs to contain
   *  accessToken
   *  expiresAt, as a ms epochtime
   *  refreshToken, if there is one
   *  id - note that there *must* be an id property for Meteor to work with
   *  email
   *  reputation
   *  created
   * We'll put the username into the user's profile
   */
  let serviceData = {
    accessToken,
    expiresAt: new Date() + 1000 * response.expiresIn,
  }
  if (response.refreshToken) {
    serviceData.refreshToken = response.refreshToken
  }

  serviceData = { ...serviceData, ...identity }
  serviceData.id = identity.sub

  /**
   * Return the serviceData object along with an options object containing
   * the initial profile object with the username.
   */
  return {
    serviceData: serviceData,
    options: {
      profile: {
        name: response.username, // comes from the token request
      },
    },
  }
})

/**
 * The following three utility functions are called in the above code to get
 *  the access_token, refresh_token and username (getTokens)
 *  account data (getAccount)
 *  settings data (getSettings)
 * repectively.
 */

/** getTokens exchanges a code for a token in line with Imgur's documentation
 *
 *  returns an object containing:
 *   accessToken        {String}
 *   expiresIn          {Integer}   Lifetime of token in seconds
 *   refreshToken       {String}    If this is the first authorization request
 *   account_username   {String}    User name of the current user
 *   token_type         {String}    Set to 'Bearer'
 *
 * @param   {Object} config       The OAuth configuration object
 * @param   {Object} query        The OAuth query object
 * @return  {Object}              The response from the token request (see above)
 */

const fetchTokensAsync = (config, query, callback) => {
  const endpoint = `https://${config.hostname}/oauth/token`
  /**
   * Attempt the exchange of code for token
   */
  fetch(endpoint, {
    method: 'POST',
    headers: new Headers({
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': `Meteor/${Meteor.release}`,
    }),
    body: JSON.stringify({
      code: query.code,
      client_id: config.clientId,
      client_secret: config.secret,
      grant_type: 'authorization_code',
      redirect_uri: OAuth._redirectUri('auth0', config),
    }),
  })
    .then(response => {
      response.json().then(data => callback(undefined, data))
    })
    .catch(error => {
      callback(new Error(`Failed to complete OAuth handshake with Auth0. ${error.message}`), error)
    })
}

const getTokens = Meteor.wrapAsync(fetchTokensAsync)

/**
 * getAccount gets the basic Imgur account data
 *
 *  returns an object containing:
 *   id             {Integer}         The user's Imgur id
 *   url            {String}          The account username as requested in the URI
 *   bio            {String}          A basic description the user has filled out
 *   reputation     {Float}           The reputation for the account.
 *   created        {Integer}         The epoch time of account creation
 *   pro_expiration {Integer/Boolean} False if not a pro user, their expiration date if they are.
 *
 * @param   {Object} config       The OAuth configuration object
 * @param   {String} username     The Imgur username
 * @param   {String} accessToken  The OAuth access token
 * @return  {Object}              The response from the account request (see above)
 */
const fetchAccountAsync = (config, accessToken, callback) => {
  const endpoint = `https://${config.hostname}/userinfo`

  fetch(endpoint, {
    method: 'GET',
    headers: new Headers({
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    }),
  })
    .then(response => {
      response.json().then(data => callback(undefined, data))
    })
    .catch(error => {
      callback(new Error(`Failed to fetch account data from Auth0. ${error.message}`, error))
    })
}
const getAccount = Meteor.wrapAsync(fetchAccountAsync)
