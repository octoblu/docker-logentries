#! /usr/bin/env node
'use strict'

const _             = require('lodash')
const request       = require('request')
const tls           = require('tls')
const net           = require('net')
const eos           = require('end-of-stream')
const through       = require('through2')
const allContainers = require('docker-allcontainers')
const statsFactory  = require('docker-stats')
const logFactory    = require('docker-loghose')
const eventsFactory = require('docker-event-log')
const envalid       = require('envalid')

function connect (opts) {
  let stream
  if (opts.secure) {
    stream = tls.connect(opts.port, opts.hostname, onSecure)
  } else {
    stream = net.createConnection(opts.port, opts.hostname)
  }
  function onSecure () {
    // let's just crash if we are not secure
    if (!stream.authorized) throw new Error('secure connection not authorized')
  }
  return stream
}

function shouldLogType (type) {
  if (!type) return false
  if (_.startsWith(type, 'exec_start')) return false
  if (_.startsWith(type, 'exec_create')) return false
  return true
}

function start (opts) {
  console.log('starting...')
  let out
  let noRestart = _.noop

  const filter = through.obj(function (obj, enc, cb) {
    obj = convertObj(obj, opts)
    let token
    if (obj.line) {
      token = opts.logsToken
    } else if (shouldLogType(obj.type)) {
      token = opts.eventsToken
    } else if (obj.stats) {
      token = opts.statsToken
    }

    if (token) {
      this.push(token)
      this.push(' ')
      this.push(JSON.stringify(obj))
      this.push('\n')
    }

    cb()
  })

  const events = allContainers(opts)

  let logsStream
  let statsStream
  let dockerEventsStream
  let streamsOpened = 0

  opts.events = events

  if (opts.enableLogs && opts.logsToken) {
    logsStream = logFactory(opts)
    logsStream.pipe(filter)
    streamsOpened++
  }

  if (opts.stats && opts.statsToken) {
    statsStream = statsFactory(opts)
    statsStream.pipe(filter)
    streamsOpened++
  }

  if (opts.enableDockerEvents && opts.eventsToken) {
    dockerEventsStream = eventsFactory(opts)
    dockerEventsStream.pipe(filter)
    streamsOpened++
  }

  pipe()

  // destroy out if all streams are destroyed
  logsStream && eos(logsStream, function () {
    streamsOpened--
    streamClosed(streamsOpened)
  })
  statsStream && eos(statsStream, function () {
    streamsOpened--
    streamClosed(streamsOpened)
  })
  dockerEventsStream && eos(dockerEventsStream, function () {
    streamsOpened--
    streamClosed(streamsOpened)
  })

  function convertObj (obj, opts) {
    obj = _.cloneDeep(obj)
    _.set(obj, 'instanceId', opts.instanceId)
    return obj
  }

  function pipe () {
    if (out) {
      filter.unpipe(out)
    }
    out = connect(opts)
    filter.pipe(out, { end: false })
    // automatically reconnect on socket failure
    noRestart = eos(out, pipe)
  }

  function streamClosed (streamsOpened) {
    if (streamsOpened <= 0) {
      noRestart()
      out.destroy()
    }
  }
}

function getInstanceId({ GET_INSTANCE_ID }, callback) {
  if (!GET_INSTANCE_ID) {
    return callback(null, 'some-id')
  }
  const url = 'http://169.254.169.254/latest/meta-data/instance-id'
  request.get(url, (error, response, instanceId) => {
    if (error) {
      return callback(error)
    }
    if (response.statusCode > 399) {
      return callback(new Error(`Unexpected Status Code ${response.statusCode}`))
    }
    callback(null, instanceId)
  })
}

function cli () {
  const env = envalid.cleanEnv(process.env, {
    LOGENTRIES_ENABLE_LOGS: envalid.bool({ default: true }),
    LOGENTRIES_ENABLE_STATS: envalid.bool({ default: true }),
    LOGENTRIES_ENABLE_DOCKER_EVENTS: envalid.bool({ default: true }),
    LOGENTRIES_LOGSTOKEN: envalid.str(),
    LOGENTRIES_STATSTOKEN: envalid.str(),
    LOGENTRIES_EVENTSTOKEN: envalid.str(),
    LOGENTRIES_PORT: envalid.num({ default: 443 }),
    LOGENTRIES_HOSTNAME: envalid.str({ default: 'data.logentries.com' }),
    LOGENTRIES_SECURE: envalid.bool({ default: true }),
    GET_INSTANCE_ID: envalid.bool({ default: true }),
  })
  getInstanceId(env, (error, instanceId) => {
    if (error) {
      throw error
    }
    const opts = {
      enableLogs: env.LOGENTRIES_ENABLE_LOGS,
      enableStats: env.LOGENTRIES_ENABLE_STATS,
      enableDockerEvents: env.LOGENTRIES_DOCKER_EVENTS,
      logsToken: env.LOGENTRIES_LOGSTOKEN,
      statsToken: env.LOGENTRIES_STATSTOKEN,
      eventsToken: env.LOGENTRIES_EVENTSTOKEN,
      secure: env.LOGENTRIES_SECURE,
      port: env.LOGENTRIES_PORT,
      hostname: env.LOGENTRIES_HOSTNAME,
      instanceId: instanceId,
    }
    start(opts)
  })
}

module.exports = start

if (require.main === module) {
  cli()
}
