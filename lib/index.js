var config = require('../config')
var debug = require('debug')('api:filestore')
var EventEmitter = require('events').EventEmitter
var Loki = require('lokijs')
var mkdirp = require('mkdirp')
var path = require('path')
var util = require('util')

/**
 *
 */
var DataStore = function DataStore (options) {
  this.config = options || config.get()

  this.databasePath = path.resolve(this.config.path)

  // ensure this path exists
  mkdirp.sync(path.dirname(this.databasePath))

  this.database = new Loki(this.databasePath, {
    autosave: true,
    autosaveInterval: 1000 * 20 * 1,
    persistenceAdapter: 'fs'
  })

  // connection readyState
  // 0 = disconnected
  // 1 = connected
  // 2 = connecting
  // 3 = disconnecting
  this.readyState = 0
}

util.inherits(DataStore, EventEmitter)

/**
 *
 */
DataStore.prototype.connect = function (options) {
  debug('connect %o', options)

  return new Promise((resolve, reject) => {
    var collection = this.database.getCollection(options.collection)

    if (!collection) {
      collection = this.database.addCollection(options.collection)
      this.database.saveDatabase()
    }

    this.readyState = 1

    return resolve()
  })
}

/**
 *
 */
DataStore.prototype.getDatabase = function (collection) {
  return new Promise((resolve, reject) => {
    return resolve(this.database.getCollection(collection))
  })
}

/**
 * Query the database
 *
 * @param {Object} query - the MongoDB query to perform
 * @param {String} collection - the name of the collection to query
 * @param {Object} options - a set of query options, such as page, limit, sort
 */
DataStore.prototype.find = function (query, collection, options) {
  debug('find in %s %o %o', collection, query, options)

  return new Promise((resolve, reject) => {
    this.getDatabase(collection).then((collection) => {
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
    this.getDatabase(collection).then((collection) => {
      var results = collection.insert(data)

      results = Array.isArray(results) ? results : [results]
      return resolve(results)
    })
  })
}

/**
 * Update documents in the database
 *
 * @param {Object} query - the MongoDB query that selects documents for update
 * @param {String} collection - the name of the collection to update documents in
 */
DataStore.prototype.update = function (query, collection, update, options) {
  return new Promise((resolve, reject) => {
    this.getDatabase(collection).then((collection) => {
    // this.database.collection(collection).updateMany(query, update, options, (err, result) => {
      // if (err) return reject(err)
      // return resolve({ matchedCount: result.matchedCount })
    })
  })
}

/**
 * Remove documents from the database
 *
 * @param {Object} query - the MongoDB query that selects documents for deletion
 * @param {String} collection - the name of the collection to delete from
 */
DataStore.prototype.delete = function (query, collection) {
  return new Promise((resolve, reject) => {
    this.getDatabase(collection).then((collection) => {
    // this.database.collection(collection).deleteMany(query, (err, result) => {
    //  if (err) return reject(err)
      // return resolve({ deletedCount: result.deletedCount })
    })
  })
}

module.exports = DataStore
