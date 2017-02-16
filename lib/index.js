var config = require('../config')
var debug = require('debug')('api:filestore')
var EventEmitter = require('events').EventEmitter
var fs = require('fs')
var Loki = require('lokijs')
var mkdirp = require('mkdirp')
var path = require('path')
var util = require('util')

// connection readyState
// 0 = disconnected
// 1 = connected
// 2 = connecting
// 3 = disconnecting

/**
 * @typedef ConnectionOptions
 * @type {object}
 * @property {string} database - the name of the database file to use
 * @property {object} collection - the name of the collection to use
 */

/**
 *
 */
var DataStore = function DataStore (options) {
  this.config = options || config.get()

  this.databasePath = path.resolve(this.config.database.path)

  // ensure this path exists
  mkdirp(this.databasePath, (err, made) => {
    if (err) throw (err)
    if (made) debug('created database directory %s', made)
  })

  this._connections = []

  this.readyState = 0
}

util.inherits(DataStore, EventEmitter)

/**
 * Connect
 *
 * @param {ConnectionOptions} options - contains
 */
DataStore.prototype.connect = function (options) {
  debug('connect %o', options)

  return new Promise((resolve, reject) => {
    if (!this.database) {
      var fileName = `${options.database}.db`

      this.database = new Loki(path.join(this.databasePath, fileName), {
        autoload: true,
        autosave: true,
        autosaveInterval: this.config.database.autosaveInterval,
        persistenceAdapter: 'fs',
        serializationMethod: this.config.database.serializationMethod
      })

      fs.stat(path.join(this.databasePath, fileName), (err, stats) => {
        if (err) {
          fs.writeFileSync(path.join(this.databasePath, fileName), JSON.stringify({}, null, 2))
          this.readyState = 1
          return resolve()
        } else {
          this.database.on('loaded', (msg) => {
            debug(msg)

            this.readyState = 1
            return resolve()
          })
        }
      })
    } else {
    //   var collection = this.database.getCollection(options.collection)
    //
    //   if (!collection) {
    //     collection = this.database.addCollection(options.collection)
    //   }
    //
      return resolve()
    }
  })
}

/**
 *
 */
DataStore.prototype.getCollection = function (collectionName) {
  return new Promise((resolve, reject) => {
    var collection = this.database.getCollection(collectionName)

    if (!collection) {
      collection = this.database.addCollection(collectionName)
    }

    return resolve(collection)
  })
}

/**
 * Query the database
 *
 * @param {Object} query - the query to perform
 * @param {String} collection - the name of the collection to query
 * @param {Object} options - a set of query options, such as page, limit, sort
 */
DataStore.prototype.find = function (query, collection, options) {
  debug('find in %s %o %o', collection, query, options)

  return new Promise((resolve, reject) => {
    this.getCollection(collection).then((collection) => {
      var results = collection.find(query)
      // if (err) return reject(err)
      return resolve(results)
    }).catch((err) => {
      return reject(err)
    })
  })
}

/**
 * Insert documents into the database
 *
 * @param {Object|Array} data - a single document or an Array of documents to insert
 * @param {String} collection - the name of the collection to insert into
 * @returns {Array} an Array containing the inserted documents
 */
DataStore.prototype.insert = function (data, collection) {
  debug('insert into %s %o', collection, data)

  // make an Array of documents if an Object has been provided
  if (!Array.isArray(data)) {
    data = [data]
  }

  return new Promise((resolve, reject) => {
    this.getCollection(collection).then((collection) => {
      var results = collection.insert(data)

      results = Array.isArray(results) ? results : [results]
      return resolve(results)
    })
  })
}

/**
 * Update documents in the database
 *
 * @param {Object} query - the query that selects documents for update
 * @param {String} collection - the name of the collection to update documents in
 */
DataStore.prototype.update = function (query, collection, update, options) {
  return new Promise((resolve, reject) => {
    this.getCollection(collection).then((collection) => {
    // this.database.collection(collection).updateMany(query, update, options, (err, result) => {
      // if (err) return reject(err)
      // return resolve({ matchedCount: result.matchedCount })
    })
  })
}

/**
 * Remove documents from the database
 *
 * @param {Object} query - the query that selects documents for deletion
 * @param {String} collection - the name of the collection to delete from
 */
DataStore.prototype.delete = function (query, collection) {
  return new Promise((resolve, reject) => {
    this.getCollection(collection).then((collection) => {
    // this.database.collection(collection).deleteMany(query, (err, result) => {
    //  if (err) return reject(err)
      // return resolve({ deletedCount: result.deletedCount })
    })
  })
}

module.exports = DataStore
