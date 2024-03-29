Package.describe({
  name: 'optune:auth0-oauth',
  version: '2.5.8',
  summary: 'OAuth handler for Auth0',
  documentation: 'README.md'
});

Package.onUse(function(api) {
  api.versionsFrom('2.3');
  api.use('ecmascript');
  api.use('oauth2', ['client', 'server']);
  api.use('oauth', ['client', 'server']);
  api.use('http', ['server']);
  api.use(['underscore', 'service-configuration'], ['client', 'server']);
  api.use(['random'], 'client');
  api.use('accounts-oauth', ['client', 'server']);
  api.use('accounts-base', ['client', 'server']);

  // Export Accounts (etc) to packages using this one.
  api.imply('accounts-base', ['client', 'server'])

  api.addFiles('auth0_client.js', 'web')
  api.addFiles('auth0_server.js', 'server')
  api.addFiles('oauth_inline_server.js', 'server')

  api.addAssets(['end_of_inline_form_response.html'], 'server')
  api.addAssets(['end_of_inline_form_response.js'], 'client')

  api.export('Auth0')
})
