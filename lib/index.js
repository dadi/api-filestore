'use strict'

const config = require('../config')
const debug = require('debug')('api:filestore')
const EventEmitter = require('events').EventEmitter
const fs = require('fs')
const Loki = require('lokijs')
const metadata = require('@dadi/metadata')
const mkdirp = require('mkdirp')
const path = require('path')
const packageManifest = require('../package.json')
const util = require('util')
const Update = require('./update')
const uuid = require('uuid')

const STATE_DISCONNECTED = 0
const STATE_CONNECTED = 1

/**
 * @typedef ConnectionOptions
 * @type {Object}
 * @property {string} database - the name of the database file to use
 * @property {string} collection - the name of the collection to use
 */

/**
 * @typedef QueryOptions
 * @type {Object}
 * @property {number} limit - the number of records to return
 * @property {number} skip - an offset, the number of records to skip
 * @property {Object} sort - an object specifying properties to sort by. `{"title": 1}` will sort the results by the `title` property in ascending order. To reverse the sort, use `-1`: `{"title": -1}`
 * @property {Object} fields - an object specifying which properties to return. `{"title": 1}` will return results with all properties removed except for `_id` and `title`
 */

/**
 * Handles the interaction with LokiJS
 * @constructor DataStore
 * @classdesc DataStore adapter for using LokiJS with DADI API
 * @implements EventEmitter
 */
const DataStore = function(options) {
  this.config = options || config.get()
  this.databasePath = path.resolve(this.config.database.path)

  const baseDirectory = path.dirname(this.databasePath)

  // ensure this path exists
  this.directoryCreation = new Promise((resolve, reject) => {
    mkdirp(baseDirectory, (err, made) => {
      if (err) return reject(err)

      if (made) {
        debug('created database directory %s', made)
      }

      resolve()
    })
  })

  this.readyState = STATE_DISCONNECTED
}

util.inherits(DataStore, EventEmitter)

/**
 * Receives a fields projection (or an array of fields to include) and an array
 * of documents. Returns the same array of documents after applying the field
 * projection.
 *
 * @param {Array|Object} fields    - an array of field names or a projection
 * @param {Array}        documents - an array of documents
 * @returns {Array} an array of filtered documents
 */
DataStore.prototype.applyFieldsFilterToResults = function(fields, documents) {
  if (!fields || Object.keys(fields).length === 0) {
    return documents
  }

  const normalisedDocuments = Array.isArray(documents) ? documents : [documents]
  const flattenedProjection = Array.isArray(fields)
    ? fields.reduce((result, field) => {
        result[field] = 1

        return result
      }, {})
    : fields
  const projection = this.convertFieldsProjection(flattenedProjection)
  const isExclusion = Object.keys(projection).some(field => {
    return projection[field] === 0
  })
  const filteredDocuments = normalisedDocuments.map(document => {
    return Object.keys(document).reduce((result, field) => {
      if (
        field === '_id' ||
        (isExclusion && projection[field] === undefined) ||
        (!isExclusion && projection[field] === 1)
      ) {
        result[field] = document[field]
      } else if (!isExclusion && projection[field]) {
        // We're dealing with nested projections, so we filter the referenced
        // document with a recursive call to `applyFieldsFilterToResults` using
        // the nested projection.
        result[field] = this.applyFieldsFilterToResults(
          projection[field],
          document[field]
        )
      }

      return result
    }, {})
  })

  return Array.isArray(documents) ? filteredDocuments : filteredDocuments[0]
}

/**
 * Receives a fields projection that might contain dot-notation fields (e.g. {
 * "field1.subField1": 1}) and converts that to a seris of nested field
 * projections without dot-notation (i.e. {"field1": {"subField1": 1}}).
 *
 * @param   {Object} projection
 * @returns {Object}
 */
DataStore.prototype.convertFieldsProjection = function(projection) {
  const result = {}

  Object.keys(projection).forEach(field => {
    const nodes = field.split('.')
    let pointer = result

    nodes.slice(0, -1).forEach(node => {
      pointer[node] = pointer[node] || {}
      pointer = pointer[node]
    })

    pointer[nodes.slice(-1)] = projection[field]
  })

  return result
}

/**
 * Close the connection to the database, persisting it to disk
 *
 * @return {Promise}
 */
DataStore.prototype.close = function() {
  return this.database.then(database => {
    return new Promise((resolve, reject) => {
      database.close(resolve)
    })
  })
}

/**
 * Connect to the JSON database file
 *
 * @param {ConnectionOptions} {database, collection}
 */
DataStore.prototype.connect = function({database, collection}) {
  debug('connect %o', database, collection)

  this.database =
    this.database ||
    this.directoryCreation.then(() => {
      this.name = database

      return new Promise((resolve, reject) => {
        fs.stat(this.databasePath, (err, stats) => {
          if (err) {
            fs.writeFile(
              this.databasePath,
              JSON.stringify({}, null, 2),
              err => {
                if (err) {
                  return reject(err)
                }

                resolve()
              }
            )
          } else {
            resolve()
          }
        })
      }).then(() => {
        const database = new Loki(this.databasePath, {
          autoload: true,
          autosave: true,
          autosaveInterval: this.config.database.autosaveInterval,
          persistenceAdapter: 'fs',
          serializationMethod: this.config.database.serializationMethod
        })

        return new Promise((resolve, reject) => {
          database.on('loaded', msg => {
            this.readyState = STATE_CONNECTED

            this.emit('DB_CONNECTED', database)

            return resolve(database)
          })
        })
      })
    })

  return this.database
}

/**
 *
 */
DataStore.prototype.getCollection = function(collectionName) {
  return this.database.then(database => {
    return new Promise((resolve, reject) => {
      let collection = database.getCollection(collectionName)

      if (!collection) {
        collection = database.addCollection(collectionName)
      }

      return resolve(collection)
    })
  })
}

/**
 * Given a collection schema, returns the field settings for a specified key or it's
 * parent if the key is using dot notation.
 * If dot notation is used, the first part of the key is used to
 * locate the parent in the schema to determine the settings.
 */
DataStore.prototype.getFieldOrParentSchema = function(key, schema) {
  // use the key as specified or the first part after splitting on '.'
  const keyOrParent = key.split('.').length > 1 ? key.split('.')[0] : key

  return schema[keyOrParent]
}

/**
 * Responds to API with information about the data connector module.
 *
 * @return {Object}
 */
DataStore.prototype.handshake = function() {
  return {
    version: packageManifest.version
  }
}

/**
 *
 */
DataStore.prototype.prepareQuery = function(query, schema) {
  Object.keys(query).forEach(key => {
    if (Object.prototype.toString.call(query[key]) === '[object RegExp]') {
      const re = new RegExp(query[key])

      query[key] = {$regex: [re.source, re.flags]}
    } else {
      if (typeof query[key] === 'object' && query[key]) {
        Object.keys(query[key]).forEach(k => {
          // change $ne: null to $ne: undefined, as per https://github.com/techfort/LokiJS/issues/285
          if (
            k === '$ne' &&
            typeof query[key][k] === 'object' &&
            query[key][k] === null
          ) {
            query[key] = {$ne: undefined}
          }
        })
      } else if (query[key] === null) {
        query[key] = {
          $exists: false
        }
      }
    }
  })

  // Transform a query like this:
  //
  // {"fieldOne": 1, "fieldTwo": {"$gt": 1, "$lt": 10}}
  //
  // ... into:
  //
  // [
  //   {"fieldOne": 1},
  //   {"fieldTwo": {"$gt": 1}},
  //   {"fieldTwo": {"$lt": 10}}
  // ]
  const expressions = Object.keys(query).reduce((expressions, field) => {
    if (Boolean(query[field]) && typeof query[field] === 'object') {
      Object.keys(query[field]).forEach(operator => {
        expressions.push({
          [field]: {
            [operator]: query[field][operator]
          }
        })
      })
    } else {
      expressions.push({
        [field]: query[field]
      })
    }

    return expressions
  }, [])

  // Construct an $and query when more than one expression is given.
  if (expressions.length > 1) {
    query = {
      $and: expressions
    }
  }

  return query
}

/**
 *
 */
DataStore.prototype.getSortParameters = function(options) {
  const sort = {
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
 * Query the database
 *
 * @param {Object} query - the query to perform
 * @param {string} collection - the name of the collection to query
 * @param {QueryOptions} options - a set of query options, such as offset, limit, sort, fields
 * @param {Object} schema - the JSON schema for the collection
 * @returns {Promise.<Array, Error>} A promise that returns an Array of results,
 *     or an Error if the operation fails
 */
DataStore.prototype.find = function({
  query,
  collection,
  options = {},
  schema,
  settings
}) {
  options = options || {}
  query = this.prepareQuery(query, schema)

  debug('find in %s where %s %o', collection, JSON.stringify(query), options)

  return new Promise((resolve, reject) => {
    this.getCollection(collection)
      .then(collection => {
        let results

        const sort = this.getSortParameters(options)

        const baseResultset = collection.chain().find(query)
        const branchedResultset = baseResultset.branch()

        // count of records matching the filter
        const count = branchedResultset.count()

        results = baseResultset
          .simplesort(sort.property, sort.descending)
          .offset(options.skip || 0)
          .limit(options.limit || 100)
          .data()

        // Apply filters projection, if defined.
        results = this.applyFieldsFilterToResults(options.fields, results)

        const returnData = {}

        returnData.results = results
        returnData.metadata = this.getMetadata(options, count)

        return resolve(returnData)
      })
      .catch(err => {
        return reject(err)
      })
  })
}

/**
 * Insert documents into the database
 *
 * @param {Object|Array} data - a single document or an Array of documents to insert
 * @param {string} collection - the name of the collection to insert into
 * @param {Object} schema - the JSON schema for the collection
 * @returns {Promise.<Array, Error>} A promise that returns an Array of inserted documents,
 *     or an Error if the operation fails
 */
DataStore.prototype.insert = function({
  data,
  collection,
  options = {},
  schema,
  settings = {}
}) {
  debug('insert into %s %o', collection, data)

  // make an Array of documents if an Object has been provided
  if (!Array.isArray(data)) {
    data = [data]
  }

  // add an _id if the document doesn't come with one
  data.forEach(document => {
    document._id = document._id || uuid.v4()
  })

  return new Promise((resolve, reject) => {
    this.getCollection(collection).then(collection => {
      try {
        let results = collection.insert(data)

        results = Array.isArray(results) ? results : [results]

        return resolve(results)
      } catch (err) {
        console.log(err)

        return reject(err)
      }
    })
  })
}

/**
 * Update documents in the database
 *
 * @param {Object} query - the query that selects documents for update
 * @param {string} collection - the name of the collection to update documents in
 * @param {Object} update - the update for the documents matching the query
 * @param {Object} schema - the JSON schema for the collection
 * @returns {Promise.<Array, Error>} A promise that returns an Array of updated documents,
 *     or an Error if the operation fails
 */
DataStore.prototype.update = function({
  query,
  collection,
  update,
  options = {},
  schema
}) {
  query = this.prepareQuery(query)

  debug('update %s where %o with %o', collection, query, update)

  return new Promise((resolve, reject) => {
    this.getCollection(collection).then(collection => {
      const updateFn = new Update(update)

      let results = collection
        .chain()
        .find(query)
        .data()

      results = updateFn.update(results)

      collection.update(results)

      return resolve({
        matchedCount: results.length
      })
    })
  })
}

/**
 * Remove documents from the database
 *
 * @param {Object} query - the query that selects documents for deletion
 * @param {string} collection - the name of the collection to delete from
 * @param {Object} schema - the JSON schema for the collection
 * @returns {Promise.<Array, Error>} A promise that returns an Object with one property `deletedCount`,
 *     or an Error if the operation fails
 */
DataStore.prototype.delete = function({query, collection, schema}) {
  query = this.prepareQuery(query)

  debug('delete from %s where %o', collection, query)

  return new Promise((resolve, reject) => {
    this.getCollection(collection).then(collection => {
      const results = collection.chain().find(query)
      const count = results.data().length

      results.remove()

      return resolve({deletedCount: count})
    })
  })
}

/**
 *
 * @param {Object} options - the query options passed from API, such as page, limit, skip
 * @param {number} count - the number of results returned in the query
 * @returns {Object} an object containing the metadata for the query, such as totalPages, totalCount
 */
DataStore.prototype.getMetadata = function(options, count) {
  return metadata(options, count)
}

/**
 *
 * @param {Object} options - the query options passed from API, such as page, limit, skip
 * @returns {Object} an object containing the metadata about the collection
 */
DataStore.prototype.stats = function(collection, options) {
  return new Promise((resolve, reject) => {
    const result = {
      count: 1,
      size: 1,
      averageObjectSize: 1,
      storageSize: 1,
      indexes: 1,
      totalIndexSize: 1,
      indexSizes: 1
    }

    return resolve(result)
  })
}

DataStore.prototype.index = function(collection, indexes) {
  return new Promise((resolve, reject) => {
    this.getCollection(collection).then(collection => {
      const results = []

      indexes.forEach((index, idx) => {
        if (
          Object.keys(index.keys).length === 1 &&
          Object.keys(index.keys)[0] === '_id'
        ) {
          // ignore _id index request, db handles this automatically
        } else {
          if (index.options && index.options.unique) {
            const uniqIdx = collection.ensureUniqueIndex(
              Object.keys(index.keys)[0]
            )

            results.push({
              collection,
              index: uniqIdx.field
            })
          } else {
            collection.ensureIndex(Object.keys(index.keys)[0])

            results.push({
              collection,
              index: Object.keys(index.keys)[0]
            })
          }

          if (idx === indexes.length - 1) {
            return resolve(results)
          }
        }
      })
    })
  })
}

/**
 * Get an array of indexes
 *
 * @param {string} collectionName - the name of the collection to get indexes for
 * @returns {Array} - an array of index objects, each with a name property
 */
DataStore.prototype.getIndexes = function(collectionName) {
  return new Promise((resolve, reject) => {
    this.getCollection(collectionName).then(collection => {
      const indexes = []

      Object.keys(collection.binaryIndices).forEach(key => {
        indexes.push({name: key})
      })

      Object.keys(collection.constraints.unique).forEach(key => {
        indexes.push({name: key, unique: true})
      })

      return resolve(indexes)
    })
  })
}

DataStore.prototype.dropDatabase = function(collectionName) {
  debug('drop %s %s', this.name, collectionName || '')

  return this.database.then(database => {
    return new Promise((resolve, reject) => {
      if (!database.collections.length) {
        return resolve()
      }

      let idx = 0

      database.collections.forEach(collection => {
        collection.clear()
        debug('dropped collection %s', collection.name)

        if (idx++ === database.collections.length - 1) {
          setTimeout(() => {
            return resolve()
          }, 500)
        }
      })
    })
  })
}

let instance

module.exports = function() {
  instance = instance || new DataStore(...arguments)

  return instance
}

module.exports.reset = function() {
  instance = undefined
}
