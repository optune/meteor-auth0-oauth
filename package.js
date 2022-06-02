Package.describe({
  name: 'optune:auth0-oauth',
  version: '2.0.0',
  summary: 'OAuth handler for Auth0 with Meteor Accounts including support for inline lock widget',
  documentation: 'README.md',
})

Npm.depends({
  'auth0-lock': '11.32.2',
  'body-parser': '1.19.2',
})

Package.onUse(function(api) {
  api.versionsFrom('2.3')
  api.use('ecmascript')
  api.use('oauth2', ['client', 'server'])
  api.use('oauth', ['client', 'server'])
  api.use('fetch', ['server'])
  api.use(['service-configuration'], ['client', 'server'])
  api.use(['random'], 'client')
  api.use('accounts-oauth', ['client', 'server'])
  api.use('accounts-base', ['client', 'server'])
  // Export Accounts (etc) to packages using this one.
  api.imply('accounts-base', ['client', 'server'])

  api.export('Auth0')

  api.addFiles('end_of_inline_form_response.html', 'server', { isAsset: true })
  api.addFiles('auth0_server.js', 'server')
  api.addFiles('auth0_client.js', 'client')
})
