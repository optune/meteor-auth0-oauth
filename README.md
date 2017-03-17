Meteor Auth0 OAuth 2.0 Provider
===============================

This is our approach of integrating Auth0 into Meteor. It focuses on the implementation on the 
backend and is frontend-agnostic, so you can develop your own frontend or use Auth0 Lock (But I don't know how to do it the moment).


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

## Project Aim
Although there are already [some other meteor-auth0 repositories out there](https://github.com/search?utf8=%E2%9C%93&q=meteor+auth0), this one has some different objectives:
- Future ready: Use ES6
- Separation of concerns: Auth0 can be used with or without Lock.js. This repo aims to be the common base.
- Best practices: Use settings.json instead of Autopublish and databases.

## Thanks and further info
- [Robfallow's Writing a Meteor OAuth 2 Handler](http://robfallows.github.io/2015/12/17/writing-an-oauth-2-handler.html)
- [Auth0's Integrating a Web App with Auth0](https://auth0.com/docs/oauth-web-protocol)
