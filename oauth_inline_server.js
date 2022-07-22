import bodyParser from 'body-parser'

import { OAuth } from 'meteor/oauth'
import { Random } from 'meteor/random'
import { RoutePolicy } from 'meteor/routepolicy'
import { ServiceConfiguration } from 'meteor/service-configuration'
import { WebApp } from 'meteor/webapp'

RoutePolicy.declare('/_oauth_inline/', 'network')

// Overwrite OAuth._loginStyleFromQuery: Check and determine login style. Valid options are 'popup', 'inline' or 'redirect'
OAuth._loginStyleFromQuery = query => {
  let style
  // For backwards-compatibility for older clients, catch any errors
  // that result from parsing the state parameter. If we can't parse it,
  // set login style to popup by default.
  try {
    style = OAuth._stateFromQuery(query).loginStyle
  } catch (err) {
    style = 'popup'
  }
  if (!['popup', 'inline', 'redirect'].includes(style)) {
    throw new Error(`Unrecognized login style: ${style}`)
  }
  return style
}

export const OAuthInline = {}

const registeredServices = {}

// OAuthInline.registerService: Register a handler for an OAuth service. The handler will be called
// when we get an incoming http request on /_oauth/{serviceName}. This
// handler should use that information to fetch data about the user
// logging in.
//
// @param name {String} e.g. "google", "facebook"
// @param version {Number} OAuth version (1 or 2)
// @param urls   For OAuth1 only, specify the service's urls
// @param handleOauthRequest {Function(oauthBinding|query)}
//   - (For OAuth1 only) oauthBinding {OAuth1Binding} bound to the appropriate provider
//   - (For OAuth2 only) query {Object} parameters passed in query string
//   - return value is:
//     - {serviceData:, (optional options:)} where serviceData should end
//       up in the user's services[name] field
//     - `null` if the user declined to give permissions
//
OAuthInline.registerService = (name, version, urls, handleOauthRequest) => {
  if (registeredServices[name]) throw new Error(`Already registered the ${name} OAuth service`)

  registeredServices[name] = {
    serviceName: name,
    version,
    urls,
    handleOauthRequest,
  }

  // Register service in underlying OAuth
  OAuth.registerService(name, version, urls, handleOauthRequest)
}

const middleware = (req, res, next) => {
  let requestData
  let requestType

  // Make sure to catch any exceptions because otherwise we'd crash
  // the runner
  try {
    const request = checkOauthRequest(req)

    if (!request?.serviceName) {
      // not an oauth request. pass to next middleware.
      next()
      return
    }

    const service = registeredServices[request.serviceName]

    // Skip everything if there's no service set by the oauth middleware
    if (!service) throw new Error(`Unexpected OAuth service ${request.serviceName}`)

    // Make sure we're configured
    ensureConfigured(request.serviceName)

    // Check for a registered handler
    const handler = OAuth._requestHandlers[service.version]
    if (!handler) throw new Error(`Unexpected OAuth version ${service.version}`)

    // Set request type and request data for response

    if (req.method === 'GET') {
      requestData = req.query
    } else {
      requestData = req.body
    }

    // Render response
    handler(service, requestData, res)
  } catch (requestError) {
    console.error('REQUEST ERROR', requestError)
    // if we got thrown an error, save it off, it will get passed to
    // the appropriate login call (if any) and reported there.
    //
    // The other option would be to display it in the popup tab that
    // is still open at this point, ignoring the 'close' or 'redirect'
    // we were passed. But then the developer wouldn't be able to
    // style the error or react to it in any way.
    if (requestData?.state && requestError instanceof Error) {
      try {
        // catch any exceptions to avoid crashing runner
        OAuth._storePendingCredential(OAuth._credentialTokenFromQuery(requestData), requestError)
      } catch (storeError) {
        // Ignore the error and just give up. If we failed to store the
        // error, then the login will just fail with a generic error.
        console.warn(
          'Error in OAuth Server while storing pending login result.\n' + storeError.stack ||
            storeError.message
        )
      }

      // Catch errors because any exception here will crash the runner.
      try {
        OAuthInline._endOfInlineFormResponse(res, {
          query: requestData,
          error: requestError,
        })
      } catch (responseError) {
        console.warn(
          'Error generating end of login response\n' +
            (responseError.stack || responseError.message)
        )
      }
    }
  }
}

// Listen to incoming OAuth http requests
WebApp.connectHandlers.use('/_oauth_inline', bodyParser.json())
WebApp.connectHandlers.use('/_oauth_inline', bodyParser.urlencoded({ extended: false }))
WebApp.connectHandlers.use(middleware)

// Handle /_oauth_inline/* paths and extract the service name and request type.
//
// @returns {String|null} e.g. "auth0", or null if this isn't an oauth request
const checkOauthRequest = req => {
  // req.url will be "/_oauth/<service name>" with an optional "?close".
  const i = req.url.indexOf('?')
  let barePath
  if (i === -1) barePath = req.url
  else barePath = req.url.substring(0, i)
  const splitPath = barePath.split('/')

  // Any non-oauth request will continue down the default
  // middlewares.
  if (splitPath[1] !== '_oauth_inline') return null

  // Find service based on url
  const serviceName = splitPath[2]

  if (serviceName !== 'auth0') return null

  // Define request type (login form or response token)
  return { serviceName }
}

// Make sure we're configured
const ensureConfigured = serviceName => {
  if (!ServiceConfiguration.configurations.findOne({ service: serviceName })) {
    throw new ServiceConfiguration.ConfigError()
  }
}

const isSafe = value => {
  // This matches strings generated by `Random.secret` and
  // `Random.id`.
  return typeof value === 'string' && /^[a-zA-Z0-9\-_]+$/.test(value)
}

// Internal: used by the oauth1 and oauth2 packages
const _renderOauthResults = OAuth._renderOauthResults
OAuth._renderOauthResults = (res, query, credentialSecret) => {
  const details = {
    query,
  }
  if (query.error) {
    details.error = query.error
  } else {
    const token = OAuth._credentialTokenFromQuery(query)
    const secret = credentialSecret
    if (token && secret && isSafe(token) && isSafe(secret)) {
      details.credentials = { token: token, secret: secret }
    } else {
      details.error = 'invalid_credential_token_or_secret'
    }
  }

  const loginStyle = OAuth._loginStyleFromQuery(query)

  if (loginStyle === 'inline') {
    OAuthInline._endOfInlineFormResponse(res, details)
  } else {
    _renderOauthResults(res, query, credentialSecret)
  }
}

// This "template" (not a real Spacebars template, just an HTML file
// with some ##PLACEHOLDER##s) communicates the credential secret back
// to the main window and then closes the popup.
OAuthInline._endOfInlineFormResponseTemplate = Assets.getText('end_of_inline_form_response.html')

// It would be nice to use Blaze here, but it's a little tricky
// because our mustaches would be inside a <script> tag, and Blaze
// would treat the <script> tag contents as text (e.g. encode '&' as
// '&amp;'). So we just do a simple replace.

const escapeString = s => {
  if (s) {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/\'/g, '&#x27;')
      .replace(/\//g, '&#x2F;')
  } else {
    return s
  }
}

// Renders the end of login response template into some HTML and JavaScript
// that closes the popup or redirects at the end of the OAuth flow.
//
// options are:
//   - setCredentialToken (boolean)
//   - credentialToken
//   - credentialSecret
//   - rootUrl
//   - isCordova (boolean)
//
const renderEndOfLoginResponse = options => {
  // Escape everything just to be safe (we've already checked that some
  // of this data -- the token and secret -- are safe).

  const config = {
    settings: {
      AUTH0_CLIENT_ID: Meteor.settings.public.AUTH0_CLIENT_ID,
      AUTH0_DOMAIN: Meteor.settings.public.AUTH0_DOMAIN,
    },
    setCredentialToken: !!options.setCredentialToken,
    credentialToken: escapeString(options.credentialToken),
    credentialSecret: escapeString(options.credentialSecret),
    storagePrefix: escapeString(OAuth._storageTokenPrefix),
    rootUrl: escapeString(Meteor.absoluteUrl('')),
  }

  const template = OAuthInline._endOfInlineFormResponseTemplate

  const result = template
    .replace(/##CONFIG##/, JSON.stringify(config))
    .replace(/##ROOT_URL_PATH_PREFIX##/, __meteor_runtime_config__.ROOT_URL_PATH_PREFIX)

  return `<!DOCTYPE html>\n${result}`
}

// Writes an HTTP response to the iframe at the end of an OAuth
// login flow. At this point, if the user has successfully authenticated
// to the OAuth server and authorized this app, we communicate the
// credentialToken and credentialSecret to the main window. The main
// window must provide both these values to the DDP `login` method to
// authenticate its DDP connection. After communicating these vaues to
// the main window, we close the popup.
//
// We export this function so that developers can override this
// behavior, which is particularly useful in, for example, some mobile
// environments where popups and/or `window.opener` don't work. For
// example, an app could override `OAuth._endOfPopupResponse` to put the
// credential token and credential secret in the popup URL for the main
// window to read them there instead of using `window.opener`. If you
// override this function, you take responsibility for writing to the
// request and calling `res.end()` to complete the request.
//
// Arguments:
//   - res: the HTTP response object
//   - details:
//      - query: the query string on the HTTP request
//      - credentials: { token: *, secret: * }. If present, this field
//        indicates that the login was successful. Return these values
//        to the client, who can use them to log in over DDP. If
//        present, the values have been checked against a limited
//        character set and are safe to include in HTML.
//      - error: if present, a string or Error indicating an error that
//        occurred during the login. This can come from the client and
//        so shouldn't be trusted for security decisions or included in
//        the response without sanitizing it first. Only one of `error`
//        or `credentials` should be set.
OAuthInline._endOfInlineFormResponse = (res, details) => {
  res.writeHead(200, { 'Content-Type': 'text/html' })

  if (details.error) {
    console.warn(
      'Error in OAuth Server: ' +
        (details.error instanceof Error ? details.error.message : details.error)
    )
    res.end(
      renderEndOfLoginResponse({
        setCredentialToken: false,
      }),
      'utf-8'
    )
    return
  }

  // If we have a credentialSecret, report it back to the parent
  // window, with the corresponding credentialToken. The parent window
  // uses the credentialToken and credentialSecret to log in over DDP.
  res.end(
    renderEndOfLoginResponse({
      setCredentialToken: true,
      credentialToken: details.credentials.token,
      credentialSecret: details.credentials.secret,
    }),
    'utf-8'
  )
}
