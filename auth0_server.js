import { Accounts } from 'meteor/accounts-base'
import { check, Match } from 'meteor/check'
import { fetch, Headers } from 'meteor/fetch'
import { Meteor } from 'meteor/meteor'
import { OAuth } from 'meteor/oauth'
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
    .map((subfield) => 'services.auth0.' + subfield), // don't publish refresh token

  /**
   * Other users get whitelisted fields without emails, because even with
   * autopublish, no legitimate web app should be publishing all users' emails.
   */
  forOtherUsers: Auth0.whitelistedFields
    .filter((field) => !['email', 'verified_email'].includes(field))
    .map((subfield) => 'services.auth0.' + subfield),
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
 * Classic v2/v3 verification using secret + fetch to Google endpoint
 */
const verifyRecaptchaClassic = async (token) => {
  const secret = Meteor.settings.private.RECAPTCHA_SECRET_KEY
  const endpoint = 'https://www.google.com/recaptcha/api/siteverify'

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: new Headers({
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      'User-Agent': `Meteor/${Meteor.release}`,
    }),
    body: new URLSearchParams({
      secret: secret,
      response: token
    }),
  })

  if (!res.ok) {
    throw new Meteor.Error('recaptcha-http-failed', `HTTP ${res.status}`)
  }

  const data = await res.json()

  if (!data.success) {
    throw new Meteor.Error('recaptcha-failed', 'Invalid reCAPTCHA')
  }

  return { success: true, score: data.score, action: data.action }
}

/**
 * Enterprise verification using @google-cloud/recaptcha-enterprise
 * Falls back to classic verification if project ID or site key is not configured
 */
const verifyRecaptcha = async (token, action) => {
  const projectId = Meteor.settings.private?.RECAPTCHA_ENTERPRISE_PROJECT_ID
  const siteKey =
    Meteor.settings.public?.RECAPTCHA_SITE_KEY

  if (!projectId || !siteKey) {
    return verifyRecaptchaClassic(token)
  }

  // Lazy-require to avoid loading if not used
  const { RecaptchaEnterpriseServiceClient } = Npm.require(
    '@google-cloud/recaptcha-enterprise'
  )

  const client = new RecaptchaEnterpriseServiceClient()
  const parent = client.projectPath(projectId)

  const [response] = await client.createAssessment({
    parent,
    assessment: {
      event: {
        token,
        siteKey,
      },
    },
  })

  const props = response.tokenProperties || {}
  if (!props.valid) {
    throw new Meteor.Error('recaptcha-invalid-token', String(props.invalidReason || 'invalid'))
  }

  // If an action was provided, ensure it matches
  if (action && props.action && props.action !== action) {
    throw new Meteor.Error('recaptcha-invalid-action', 'Unexpected reCAPTCHA action')
  }

  const score = response.riskAnalysis?.score
  const reasons = response.riskAnalysis?.reasons

  const minScore =
    typeof Meteor.settings.private?.RECAPTCHA_MIN_SCORE === 'number'
      ? Meteor.settings.private.RECAPTCHA_MIN_SCORE
      : 0

  if (typeof score === 'number' && score < minScore) {
    throw new Meteor.Error('recaptcha-low-score', `Score ${score} below threshold ${minScore}`)
  }

  return { success: true, score, action: props.action, reasons }
}

/**
 * Meteor method to verify reCAPTCHA token
 */
Meteor.methods({
  async 'auth0.verifyRecaptcha'(arg) {
    check(
      arg,
      Match.OneOf(String, {
        token: String,
        action: Match.Optional(String),
      })
    )

    const token = typeof arg === 'string' ? arg : arg.token
    const action = typeof arg === 'string' ? undefined : arg.action

    if (!token) {
      throw new Meteor.Error('recaptcha-missing', 'reCAPTCHA token is required')
    }

    try {
      const result = await verifyRecaptcha(token, action)
      return result
    } catch (error) {
      throw new Meteor.Error('recaptcha-verification-failed', error.message)
    }
  },
})


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

OAuthInline.registerService('auth0', 2, null, (query, ...rest) => {

  console.log('query:', query)
  console.log('rest:', rest)

  // const recaptchaToken = options?.recaptchaToken;
  // if (!recaptchaToken) {
  //   throw new Meteor.Error('recaptcha-missing', 'reCAPTCHA token required');
  // }

  // verifyRecaptcha(recaptchaToken);


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
  const data = {
    code: query.code,
    client_id: config.clientId,
    client_secret: config.secret,
    grant_type: 'authorization_code',
    redirect_uri: OAuth._redirectUri('auth0', config),
  }
  fetch(endpoint, {
    method: 'POST',
    headers: new Headers({
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': `Meteor/${Meteor.release}`,
    }),
    body: JSON.stringify(data),
  })
    .then((response) => response.json())
    .then((data) => callback(undefined, data))
    .catch((error) => {
      callback(new Error(`Failed to fetch OAuth token information from Auth0. ${error.message}`), error)
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
    .then((response) => response.json())
    .then((data) => callback(undefined, data))
    .catch((error) => {
      callback(new Error(`Failed to fetch account data from Auth0. ${error.message}`, error))
    })
}
const getAccount = Meteor.wrapAsync(fetchAccountAsync)
