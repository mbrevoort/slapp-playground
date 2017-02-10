'use strict'

const express = require('express')
const Slapp = require('slapp')
const ConvoStore = require('slapp-convo-beepboop')
const Context = require('slapp-context-beepboop')
const BeepBoopPersist = require('beepboop-persist')
const smb = require('slack-message-builder')
const Slache = require('./slache')

// use `PORT` env var on Beep Boop - default to 3000 locally
var port = process.env.PORT || 3000

var slapp = Slapp({
  // Beep Boop sets the SLACK_VERIFY_TOKEN env var
  verify_token: process.env.SLACK_VERIFY_TOKEN,
  convo_store: ConvoStore(),
  context: Context()
})

var kv = BeepBoopPersist({ provider: process.env.PERSIST_PROVIDER || 'beepboop' })
var slache = Slache(slapp, kv)

slache.on('error', (err) => {
  console.log(err)
})

slache.on('refreshUsers', (teamId, count) => {
  console.log('refreshUsers', teamId, count)
})

slache.on('purgeTeam', (teamId, count) => {
  console.log('purgeTeam', teamId, count)
})

slapp.message('user .*', ['direct_message'], (msg, val) => {
  let ids = msg.usersMentioned()
  ids.forEach(id => {
    slache.user(msg.meta.team_id, id, (err, user) => {
      if (err) return console.log(err)
      msg.say(`User: 
\`\`\`
${JSON.stringify(user, null, 2)}
\`\`\``)
    })
  })
})

slapp.message('num users', ['direct_message'], (msg, val) => {
  slache.users(msg.meta.team_id, (err, users) => {
    if (err) return console.log(err)
    msg.say(`${users.length} users`)
  })
})

// attach Slapp to express server
var server = slapp.attachToExpress(express())

// start http server
server.listen(port, (err) => {
  if (err) {
    return console.error(err)
  }

  console.log(`Listening on port ${port}`)
})
