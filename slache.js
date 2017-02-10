'use strict'
const EventEmitter = require('events')

module.exports = (slapp, kv) => {
  return new Slache(slapp, kv)
}

class Slache extends EventEmitter {

  constructor (slapp, kv) {
    super()
    this.slapp = slapp
    this.kv = kv
    let self = this

    // register middleware that looks for user_change or 'team_join' events
    slapp.use((msg, next) => {
      console.log(msg.body)
      if (msg.body.event) {
        if (msg.body.event.type === 'user_change' || msg.body.event.type === 'team_join') {
          let user = msg.body.event.user
          self.putUser(user, (err) => {
            if (err) console.log('Error updating user on user_change')
          })
        }
        if (msg.body.event.type === 'bb.team_added') {
          self.refreshUsers(msg.meta.bot_token)
        }
        if (msg.body.event.type === 'bb.team_removed') {
          self.purgeTeam(msg.meta.team_id)
        }
      }
      next()
    })
  }

  refreshUsers (token) {
    let self = this
    self.slapp.client.users.list({ token }, (err, result) => {
      if (err) {
        return self.emit('error', err)
      }
      if (!result.members || result.members.length === 0) {
        return
      }

      let users = result.members
      let teamId = users[0].team_id
      let ids = users.map(it => it.id)
      let activeUserIds = users.filter(it => !it.deleted).map(it => it.id)

      let putNextUser = (i) => {
        self.kv.set(userKey(users[i].team_id, users[i].id), users[i], (err) => {
          if (err) self.emit('error', err)
          i++
          if (i >= users.length) {
            return self.emit('refreshUsers', teamId, users.length)
          }
          putNextUser(i)
        })
      }

      putNextUser(0)

      self.kv.set(usersKey(teamId), ids, (err) => {
        if (err) return self.emit('error', err)
      })
      self.kv.set(activeUsersKey(teamId), activeUserIds, (err) => {
        if (err) return self.emit('error', err)
      })
    })
  }

  purgeTeam (teamId) {
    let self = this
    self.kv.get(usersKey(teamId), (err, ids) => {
      if (err) return self.emit('error', err)
      if (!ids || !ids.length) return self.emit('purgeTeam', teamId)
      self.kv.del(usersKey(teamId), self._callback)
      self.kv.del(activeUsersKey(teamId), self._callback)

      let deleteNextUser = (i) => {
        self.kv.del(userKey(teamId, ids[i]), (err) => {
          if (err) self.emit('error', err)
          i++
          if (i >= ids.length) {
            return self.emit('purgeTeam', teamId)
          }
          deleteNextUser(i)
        })
      }
      deleteNextUser(0)
    })
  }

  user (teamId, userId, callback) {
    this.kv.get(userKey(teamId, userId), callback)
  }

  users (teamId, callback) {
    let self = this
    self.kv.get(usersKey(teamId), (err, ids) => {
      if (err) return callback(err)
      self.kv.mget(ids, callback)
    })
  }

  putUser (user) {
    let self = this

    this._updateUsers(user)
    this.kv.set(userKey(user.team_id, user.id), user, self._callback)
  }

  _updateUsers (user, callback) {
    let self = this
    let key = usersKey(user.team_id)
    self.kv.get(key, (err, users) => {
      if (err) return self.emit('error', err)
      if (users.indexOf(user.id) >= 0) {
        return
      }
      users.push(user.id)
      self.kv.set(key, users, self._callback)
    })
  }

  _updateActiveUsers (user) {
    let self = this
    let key = activeUsersKey(user.team_id)
    self.kv.get(key, (err, users) => {
      if (err) return self.emit('error', err)
      if (user.deleted) {
        users = users.filter(id => id === user.id)
      } else {
        if (users.indexOf(user.id) === -1) {
          users.push(user.id)
        } else {
          return
        }
      }
      self.kv.set(key, users, self._callback)
    })
  }

  _callback (err) {
    if (err) this.emit('error', err)
  }

}

function usersKey (teamId) {
  return `team:${teamId}:users`
}

function activeUsersKey (teamId) {
  return `team:${teamId}:active_users`
}

function userKey (teamId, userId) {
  return `team:${teamId}:user:${userId}`
}
