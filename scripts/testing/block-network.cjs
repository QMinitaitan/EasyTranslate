// Loaded before test code and inherited by Node children. No addresses or credentials in errors.
const blocked = () => {
  const error = new Error('Offline tests block real network access')
  error.code = 'EASY_TEST_NETWORK_BLOCKED'
  throw error
}
require('node:net').Socket.prototype.connect = blocked
require('node:tls').connect = blocked
for (const protocol of ['node:http', 'node:https']) {
  require(protocol).request = blocked
  require(protocol).get = blocked
}
require('node:http2').connect = blocked
require('node:dgram').Socket.prototype.send = blocked
globalThis.fetch = async () => blocked()
if (globalThis.WebSocket) globalThis.WebSocket = class { constructor() { blocked() } }
require('node:module').syncBuiltinESMExports()
