/**
 * Define the base object namespace. By convention we use the service name
 * in PascalCase (aka UpperCamelCase). Note that this is defined as a package global.
 */
Auth0 = {}
Accounts.oauth.registerService('auth0')

Auth0.whitelistedFields = ['id', 'email', 'picture', 'name']

Accounts.addAutopublishFields({
  forLoggedInUser: _.map(
    /**
     * Logged in user gets whitelisted fields + accessToken + expiresAt.
     */
    Auth0.whitelistedFields.concat(['accessToken', 'expiresAt']), // don't publish refresh token
    function (subfield) {
      return 'services.auth0.' + subfield
    }
  ),

  forOtherUsers: _.map(
    /**
     * Other users get whitelisted fields without emails, because even with
     * autopublish, no legitimate web app should be publishing all users' emails.
     */
    _.without(Auth0.whitelistedFields, 'email', 'verified_email'),
    function (subfield) {
      return 'services.auth0.' + subfield
    }
  ),
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

const getToken = function (authResponse) {
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
OAuth.registerService('auth0', 2, null, function (query) {
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
  const response = query.type === 'token' ? getToken(query) : getTokens(config, query)
  const accessToken = response.accessToken
  const username = response.username

  /**
   * If we got here, we can now request data from the account endpoints
   * to complete our serviceData request.
   * The identity object will contain the username plus *all* properties
   * retrieved from the account and settings methods.
   */
  const identity = _.extend({ username }, getAccount(config, username, accessToken))

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
  const serviceData = {
    accessToken,
    expiresAt: +new Date() + 1000 * response.expiresIn,
  }
  if (response.refreshToken) {
    serviceData.refreshToken = response.refreshToken
  }

  _.extend(serviceData, identity)

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

const getTokens = function (config, query) {
  const endpoint = `https://${config.hostname}/oauth/token`
  /**
   * Attempt the exchange of code for token
   */
  let response
  try {
    response = HTTP.post(endpoint, {
      headers: {
        Accept: 'application/json',
        'User-Agent': `Meteor/${Meteor.release}`,
      },
      params: {
        code: query.code,
        client_id: config.clientId,
        client_secret: config.secret,
        grant_type: 'authorization_code',
        redirect_uri: OAuth._redirectUri('auth0', config),
      },
    })
  } catch (err) {
    throw _.extend(new Error(`Failed to complete OAuth handshake with Auth0. ${err.message}`), {
      response: err.response,
    })
  }

  if (response.data.error) {
    /**
     * The http response was a json object with an error attribute
     */
    throw new Error(`Failed to complete OAuth handshake with Auth0. ${response.data.error}`)
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
    return getToken(response.data)
  }
}

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
const getAccount = function (config, username, accessToken) {
  const endpoint = `https://${config.hostname}/userinfo`
  let accountObject

  /**
   * Note the strange .data.data - the HTTP.get returns the object in the response's data
   * property. Also, Imgur returns the data we want in a data property of the response data
   * Hence (response).data.data
   */
  try {
    accountObject = HTTP.get(endpoint, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    return accountObject.data
  } catch (err) {
    throw _.extend(new Error(`Failed to fetch account data from Auth0. ${err.message}`), {
      response: err.response,
    })
  }
}
