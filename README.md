Meteor Auth0 OAuth 2.0 Provider
===============================

This is our approach of integrating Auth0 into Meteor. It focuses on the implementation on the 
backend and is frontend-agnostic, so you can develop your own frontend or use Auth0 lock.


## Usage

Set your Auth0 Domain, Client ID and Client Secret in `settings.json` (read more about how to store
your API keys (Securing API Keys)[https://guide.meteor.com/security.html#api-keys] ):

```
"private": {
	"AUTH0_CLIENT_SECRET": YOUR_CLIENT_SECRET,
	/* ... other private keys */
},
"public": {
	"AUTH0_DOMAIN": yourauth0domain.eu.auth0.com
	"AUTH0_CLIENT_ID": YOUR_CLIENT_ID,
	/* ... other private keys */
}
```

Then, you can simply initiate auth with:
``` Meteor.loginWithAuth0() ```
on the client.


## Thanks and further info
- [Robfallow's Writing a Meteor OAuth 2 Handler](http://robfallows.github.io/2015/12/17/writing-an-oauth-2-handler.html)
- [Auth0's Integrating a Web App with Auth0](https://auth0.com/docs/oauth-web-protocol)