// NOTE: This file is added to the client as asset and hence ecmascript package has no effect here.
;(function() {
  var config = JSON.parse(document.getElementById('config').innerHTML)

  console.log('end of line for response')
  if (config.setCredentialToken && config.rootUrl) {
    var credentialToken = config.credentialToken
    var credentialSecret = config.credentialSecret
    var credentialString = JSON.stringify({
      credentialToken: credentialToken,
      credentialSecret: credentialSecret,
    })

    console.log({ credentialToken, credentialSecret })
    if (window.parent) {
      window.parent.postMessage(
        { type: 'AUTH0_RESPONSE', credentialToken, credentialSecret },
        config.rootUrl
      )
    } else {
      try {
        localStorage[config.storagePrefix + credentialToken] = credentialSecret
        console.log({ localStorage })
      } catch (err) {
        console.error(err)
      }
    }
  }

  if (!config.isCordova) {
    document.getElementById('completedText').style.display = 'block'
  }
})()
