var merge = require('./merge')

var DEFAULT_OPTIONS = {
  minDelay: 1000,
  maxDelay: 5000,
  attempts: Infinity
}

var FATAL_ERRORS = ['wrong-protocol', 'wrong-subprotocol', 'wrong-credentials']

/**
 * Wrapper for {@link Connection} for reconnecting it on every disconnect.
 *
 * @param {Connection} connection The connection to be reconnectable.
 * @param {object} [options] Options.
 * @param {number} [options.minDelay=1000] Minimum delay between reconnecting.
 * @param {number} [options.maxDelay=5000] Maximum delay between reconnecting.
 * @param {number} [options.attempts=Infinity] Maximum reconnecting attempts.
 *
 * @example
 * import { Reconnect } from 'logux-core'
 * const recon = new Reconnect(connection)
 * ClientHost(nodeId, log, recon, options)
 *
 * @class
 * @extends Connection
 */
function Reconnect (connection, options) {
  this.connection = connection
  this.options = merge(options, DEFAULT_OPTIONS)

  /**
   * Should we reconnect connection on next connection break.
   * Next {@link Reconnect#connect} call will set to `true`.
   * @type {boolean}
   *
   * @example
   * function lastTry () {
   *   recon.reconnecting = false
   * }
   */
  this.reconnecting = connection.connected
  this.connecting = false
  this.attempts = 0

  this.unbind = []
  var self = this

  this.unbind.push(this.connection.on('message', function (msg) {
    if (msg[0] === 'error' && FATAL_ERRORS.indexOf(msg[1]) !== -1) {
      self.reconnecting = false
    }
  }))
  this.unbind.push(this.connection.on('connecting', function () {
    self.connecting = true
  }))
  this.unbind.push(this.connection.on('connect', function () {
    self.attempts = 0
    self.connecting = false
  }))
  this.unbind.push(this.connection.on('disconnect', function () {
    self.connecting = false
    if (self.reconnecting) self.reconnect()
  }))
  this.unbind.push(function () {
    clearTimeout(self.timer)
  })

  function visibility () {
    if (self.reconnecting && !self.connected && !self.connecting) {
      if (!document.hidden) self.connect()
    }
  }
  function connect () {
    if (self.reconnecting && !self.connected && !self.connecting) {
      if (navigator.onLine) self.connect()
    }
  }
  function disconnect () {
    self.disconnect('freeze')
  }
  if (typeof navigator !== 'undefined') {
    document.addEventListener('visibilitychange', visibility, false)
    window.addEventListener('focus', connect, false)
    window.addEventListener('online', connect, false)
    window.addEventListener('resume', connect, false)
    window.addEventListener('freeze', disconnect, false)
    this.unbind.push(function () {
      document.removeEventListener('visibilitychange', visibility, false)
      window.removeEventListener('focus', connect, false)
      window.removeEventListener('online', connect, false)
      window.removeEventListener('resume', connect, false)
      window.removeEventListener('freeze', disconnect, false)
    })
  }
}

Reconnect.prototype = {

  connect: function connect () {
    this.attempts += 1
    this.reconnecting = true
    return this.connection.connect()
  },

  disconnect: function disconnect (reason) {
    if (reason !== 'timeout' && reason !== 'error' && reason !== 'freeze') {
      this.reconnecting = false
    }
    return this.connection.disconnect(reason)
  },

  /**
   * Unbind all listeners and disconnect. Use it if you will not need
   * this class anymore.
   *
   * {@link BaseNode#destroy} will call this method instead
   * of {@link Reconnect#disconnect}.
   *
   * @return {undefined}
   */
  destroy: function destroy () {
    for (var i = 0; i < this.unbind.length; i++) {
      this.unbind[i]()
    }
    this.disconnect('destroy')
  },

  reconnect: function reconnect () {
    if (this.attempts > this.options.attempts - 1) {
      this.reconnecting = false
      this.attempts = 0
      return
    }

    var delay = this.nextDelay()
    var self = this
    this.timer = setTimeout(function () {
      if (self.reconnecting && !self.connecting && !self.connected) {
        self.connect()
      }
    }, delay)
  },

  send: function send () {
    return this.connection.send.apply(this.connection, arguments)
  },

  on: function on () {
    return this.connection.on.apply(this.connection, arguments)
  },

  nextDelay: function nextDelay () {
    var base = this.options.minDelay * Math.pow(2, this.attempts)
    var rand = Math.random()
    var deviation = Math.floor(rand * 0.5 * base)
    if (Math.floor(rand * 10) === 1) deviation = -deviation
    return Math.min(base + deviation, this.options.maxDelay) || 0
  }

}

Object.defineProperty(Reconnect.prototype, 'connected', {
  get: function () {
    return this.connection.connected
  }
})

module.exports = Reconnect
