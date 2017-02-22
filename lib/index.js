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
 * @property {number} limit - the number of records to return
 * @property {number} skip - an offset, the number of records to skip
 * @property {object} sort - an object specifying properties to sort by. `{"title": 1}` will sort the results by the `title` property in ascending order. To reverse the sort, use `-1`: `{"title": -1}`
 * @property {object} fields - an object specifying which properties to return. `{"title": 1}` will return results with all properties removed except for `_id` and `title`
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
 *
 */
DataStore.prototype.prepareQuery = function (query) {
  // sanitise regex queries
  Object.keys(query).forEach((key) => {
    if (Object.prototype.toString.call(query[key]) === '[object RegExp]') {
      query[key] = { '$regex': new RegExp(query[key]) }
    }
  })

  // construct an $and query when more than one expression is given
  if (Object.keys(query).length > 1) {
    query = {
      '$and': Object.keys(query).map((key) => {
        var expression = {}
        expression[key] = query[key]
        return expression
      })
    }
  }

  return query
}

/**
 *
 */
DataStore.prototype.getSortParameters = function (options) {
  var sort = {
    property: '$loki',
    descending: false
  }

  if (options.sort) {
    sort.property = Object.keys(options.sort)[0]
    sort.descending = options.sort[sort.property] === -1
  // } else if (Object.keys(query).length) {
  //   sortProperty = Object.keys(query)[0]
  }

  return sort
}

/**
 * Determines the list of properties to select from each document before returning. If an array is specified
 * it is returned. If an object is specified an array is created containing all the keys that have a value equal to 1.
 * The `_id` property is added if not already specified.
 *
 * @param {Array|Object} fields - an array of field names or an object such as `{"title": 1}`
 * @returns {Array} an array of property names to be selected from each document
 */
DataStore.prototype.getFields = function (fields) {
  var preparedFields

  if (!Array.isArray(fields)) {
    preparedFields = Object.keys(fields).filter((field) => { return fields[field] === 1 })
  } else {
    preparedFields = fields
  }

  if (!preparedFields['_id']) preparedFields.push('_id')

  return preparedFields
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
  options = options || {}
  query = this.prepareQuery(query)

  debug('find in %s where %o %o', collection, query, options)

  return new Promise((resolve, reject) => {
    this.getCollection(collection).then((collection) => {
      var results

      var sort = this.getSortParameters(options)

      results = collection.chain()
      .find(query)
      .simplesort(sort.property, sort.descending)
      .offset(options.skip || 0)
      .limit(options.limit || 100)
      .data()

      // if specified, return only required fields
      // 1. create array from the passed object
      // 2. add _id field if not specified
      // 3. pick fields from each result if they appear in the array
      if (options.fields && !_.isEmpty(options.fields)) {
        var fields = this.getFields(options.fields)

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
  debug('update %s where %o with %o', collection, query, update)

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
  query = this.prepareQuery(query)

  debug('delete from %s where %o', collection, query)

  return new Promise((resolve, reject) => {
    this.getCollection(collection).then((collection) => {
      var results = collection.chain().find(query)
      var count = results.data().length

      results.remove()

      return resolve({ deletedCount: count })
    })
  })
}

DataStore.prototype.dropDatabase = function (collectionName) {
  debug('dropDatabase %s', collectionName || '')

  return new Promise((resolve, reject) => {
    var idx = 0

    if (!this.database.collections.length) {
      return resolve()
    }

    _.each(this.database.collections, (collection) => {
      if (collectionName) {
        if (collection.name === collectionName) {
          collection.removeWhere(function (obj) { return true })
          debug('dropped collection %s', collection.name)
        }
      } else {
        collection.removeWhere(function (obj) { return true })
        debug('dropped collection %s', collection.name)
      }

      if (++idx === this.database.collections.length) {
        return resolve()
      }
    })
  })
}

module.exports = DataStore
