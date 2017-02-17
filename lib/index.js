var _ = require('underscore')
var config = require('../config')
var debug = require('debug')('api:filestore')
var EventEmitter = require('events').EventEmitter
var fs = require('fs')
var Loki = require('lokijs')
var mkdirp = require('mkdirp')
var path = require('path')
var util = require('util')
var Update = require('./update')
var uuid = require('uuid')

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
 * @typedef QueryOptions
 * @type {object}
 * @property {number} limit - x
 * @property {number} skip - y
 * @property {object} sort - z
 * @property {object} fields - z
 */

/**
 * Handles the connection and interactio with LokiJS
 * @constructor DataStore
 * @implements EventEmitter
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
 * @param {ConnectionOptions} options
 */
DataStore.prototype.connect = function (options) {
  debug('connect %o', options)

  return new Promise((resolve, reject) => {
    if (!this.database) {
      var fileName = `${options.database}.db`
      var filePath = path.join(this.databasePath, fileName)

      this.database = new Loki(filePath, {
        autoload: true,
        autosave: true,
        autosaveInterval: this.config.database.autosaveInterval,
        persistenceAdapter: 'fs',
        serializationMethod: this.config.database.serializationMethod
      })

      fs.stat(filePath, (err, stats) => {
        if (err) {
          fs.writeFileSync(filePath, JSON.stringify({}, null, 2))
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
 * @param {QueryOptions} options - a set of query options, such as offset, limit, sort, fields
 * @returns {Promise.<Array, Error>} A promise that returns an Array of results,
 *     or an Error if the operation fails
 */
DataStore.prototype.find = function (query, collection, options) {
  debug('find in %s where %o %o', collection, query, options)

  options = options || {}

  return new Promise((resolve, reject) => {
    this.getCollection(collection).then((collection) => {
      var results

      var sortProperty
      var sortDescending = false

      if (options.sort) {
        sortProperty = Object.keys(options.sort)[0]
        sortDescending = options.sort[sortProperty] === -1
      } else if (Object.keys(query).length) {
        sortProperty = Object.keys(query)[0]
      } else {
        sortProperty = '_id'
      }

      results = collection.chain()
      .find(query)
      .simplesort(sortProperty, sortDescending)
      .offset(options.skip || 0)
      .limit(options.limit || 100)
      .data()

      if (options.fields) {
        var fields = Object.keys(options.fields).filter((field) => { return options.fields[field] === 1 })

        if (!fields['_id']) fields.push('_id')

        results = _.chain(results)
          .map((result) => { return _.pick(result, fields) })
          .value()
      }

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
 * @returns {Promise.<Array, Error>} A promise that returns an Array of inserted documents,
 *     or an Error if the operation fails
 */
DataStore.prototype.insert = function (data, collection) {
  debug('insert into %s %o', collection, data)

  // make an Array of documents if an Object has been provided
  if (!Array.isArray(data)) {
    data = [data]
  }

  // add an _id if the document doesn't come with one
  data.forEach((document) => {
    document._id = document._id || uuid.v4()
  })

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
 * @returns {Promise.<Array, Error>} A promise that returns an Array of updated documents,
 *     or an Error if the operation fails
 */
DataStore.prototype.update = function (query, collection, update, options) {
  debug('update in %s where %o with %o', collection, query, update)

  return new Promise((resolve, reject) => {
    this.getCollection(collection).then((collection) => {
      var updateFn = new Update(update)

      var results = collection.chain().find(query).data()
      results = updateFn.update(results)

      collection.update(results)
      return resolve(results)
    })
  })
}

/**
 * Remove documents from the database
 *
 * @param {Object} query - the query that selects documents for deletion
 * @param {String} collection - the name of the collection to delete from
 * @returns {Promise.<Array, Error>} A promise that returns an Object with one property `deletedCount`,
 *     or an Error if the operation fails
 */
DataStore.prototype.delete = function (query, collection) {
  debug('delete from %s where %o', collection, query)

  return new Promise((resolve, reject) => {
    this.getCollection(collection).then((collection) => {
      var results = collection.chain().find(query)
      var count = results.filteredrows[0] || 0

      results.remove()

      return resolve({ deletedCount: count })
    })
  })
}

module.exports = DataStore
