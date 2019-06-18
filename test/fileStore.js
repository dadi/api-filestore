const EventEmitter = require('events').EventEmitter
const FileStoreAdapter = require('../lib')
const fs = require('fs')
const packageManifest = require('../package.json')
const path = require('path')
const promiseQueue = require('js-promise-queue')
const should = require('should')
const uuid = require('uuid')

const config = require(__dirname + '/../config')

describe('FileStore', function() {
  this.timeout(15000)

  beforeEach(function(done) {
    done()
  })

  afterEach(function(done) {
    FileStoreAdapter.reset()

    setTimeout(function() {
      done()
    }, 1000)
  })

  after(function(done) {
    console.log('\n  Finished, waiting for database to be written to disk...')
    setTimeout(function() {
      try {
        fs.unlinkSync(path.resolve(config.get('database.path')))
      } catch (err) {
        console.log(err)
      }

      done()
    }, 7000)
  })

  describe('constructor', function() {
    it('should be exposed', function(done) {
      FileStoreAdapter.should.be.Function
      done()
    })

    it('should inherit from EventEmitter', function(done) {
      const fileStore = new FileStoreAdapter()
      fileStore.should.be.an.instanceOf(EventEmitter)
      fileStore.emit.should.be.Function
      done()
    })

    it('should load config if no options supplied', function(done) {
      const fileStore = new FileStoreAdapter()
      should.exist(fileStore.config)
      fileStore.config.database.path.should.eql('test/db')
      done()
    })

    it('should load config from options supplied', function(done) {
      const fileStore = new FileStoreAdapter({
        database: { path: 'test/workspace2' },
      })
      should.exist(fileStore.config)
      fileStore.config.database.path.should.eql('test/workspace2')
      done()
    })

    it('should have readyState == 0 when initialised', function(done) {
      const fileStore = new FileStoreAdapter()
      fileStore.readyState.should.eql(0)
      done()
    })

    it('should expose a handshake function', function(done) {
      const fileStore = new FileStoreAdapter()

      fileStore.handshake().version.should.eql(packageManifest.version)
      done()
    })
  })

  describe('connect', function() {
    it('should create and return database when connecting', function(done) {
      const fileStore = new FileStoreAdapter()
      fileStore.connect({ database: 'content' }).then(() => {
        should.exist(fileStore.database)
        done()
      })
    })

    it('should have readyState == 1 when connected', function(done) {
      const fileStore = new FileStoreAdapter()
      fileStore
        .connect({ database: 'content', collection: 'posts' })
        .then(() => {
          fileStore.readyState.should.eql(1)
          done()
        })
    })
  })

  describe('prepareQuery', function() {
    it('should modify regular expressions to use `$regex`', function(done) {
      const fileStore = new FileStoreAdapter()
      const query = { fieldOne: /value/i }
      const prepared = fileStore.prepareQuery(query, {})

      prepared.should.eql({ fieldOne: { $regex: ['value', 'i'] } })

      done()
    })

    it('should replace `$ne: null` with `$ne: undefined`', function(done) {
      const fileStore = new FileStoreAdapter()
      const query = { fieldOne: { $ne: null } }
      const prepared = fileStore.prepareQuery(query, {})

      prepared.should.eql({ fieldOne: { $ne: undefined } })

      done()
    })

    it('should construct an "$and" query if query contains multiple expressions', function(done) {
      const fileStore = new FileStoreAdapter()
      const query = { fieldOne: 1, fieldTwo: { $gt: 1, $lt: 10 } }
      const prepared = fileStore.prepareQuery(query, {})

      should.exist(prepared['$and'])
      prepared['$and'].length.should.eql(3)
      prepared['$and'][0]['fieldOne'].should.eql(1)

      done()
    })

    it('should replace `null` with `$exists: false`', function(done) {
      const fileStore = new FileStoreAdapter()
      const query = { fieldOne: null }
      const prepared = fileStore.prepareQuery(query, {})

      prepared.should.eql({ fieldOne: { $exists: false } })

      done()
    })
  })

  describe('applyFieldsFilterToResults', function() {
    const documents = [
      {
        _id: 1,
        name: 'Ernie',
        age: 7,
        colour: 'yellow',
      },
      {
        _id: 2,
        name: 'Oscar',
        age: 9,
        colour: 'green',
      },
      {
        _id: 3,
        name: 'BigBird',
        age: 13,
        colour: 'yellow',
      },
    ]

    it('should apply a field projection (of type "includes") to an array of documents, returning the modified array', function(done) {
      const fileStore = new FileStoreAdapter()
      const fields = { _id: 1, name: 1, age: 1 }
      const modifiedDocuments = fileStore.applyFieldsFilterToResults(
        fields,
        documents
      )

      modifiedDocuments.should.eql([
        {
          _id: 1,
          name: 'Ernie',
          age: 7,
        },
        {
          _id: 2,
          name: 'Oscar',
          age: 9,
        },
        {
          _id: 3,
          name: 'BigBird',
          age: 13,
        },
      ])

      done()
    })

    it('should apply a field projection (of type "includes") to an array of documents, returning the modified array', function(done) {
      const fileStore = new FileStoreAdapter()
      const fields = { name: 0, age: 0 }
      const modifiedDocuments = fileStore.applyFieldsFilterToResults(
        fields,
        documents
      )

      modifiedDocuments.should.eql([
        {
          _id: 1,
          colour: 'yellow',
        },
        {
          _id: 2,
          colour: 'green',
        },
        {
          _id: 3,
          colour: 'yellow',
        },
      ])

      done()
    })

    it('should apply a field projection (of type "includes", in array format) to an array of documents, returning the modified array', function(done) {
      const fileStore = new FileStoreAdapter()
      const fields = ['name', 'age']
      const modifiedDocuments = fileStore.applyFieldsFilterToResults(
        fields,
        documents
      )

      modifiedDocuments.should.eql([
        {
          _id: 1,
          name: 'Ernie',
          age: 7,
        },
        {
          _id: 2,
          name: 'Oscar',
          age: 9,
        },
        {
          _id: 3,
          name: 'BigBird',
          age: 13,
        },
      ])

      done()
    })
  })

  describe('getFieldOrParentSchema', function() {
    it('should return a field from the schema by key', function(done) {
      const fileStore = new FileStoreAdapter()
      const schema = {
        name: {
          type: 'String',
        },
      }

      const field = fileStore.getFieldOrParentSchema('name', schema)

      field.type.should.eql('String')
      done()
    })

    it('should return a field from the schema by parent key', function(done) {
      const fileStore = new FileStoreAdapter()
      const schema = {
        name: {
          type: 'String',
        },
      }

      const field = fileStore.getFieldOrParentSchema('name.first', schema)

      field.type.should.eql('String')
      done()
    })
  })

  describe('insert', function() {
    it('should insert a single document into the database', function(done) {
      const fileStore = new FileStoreAdapter()
      fileStore
        .connect({ database: 'content', collection: 'users' })
        .then(() => {
          const user = { name: 'David' }

          fileStore
            .insert({ data: user, collection: 'users', schema: {} })
            .then(results => {
              results.constructor.name.should.eql('Array')
              results[0].name.should.eql('David')
              done()
            })
        })
    })

    it('should insert an array of documents into the database', function(done) {
      const fileStore = new FileStoreAdapter()
      fileStore
        .connect({ database: 'content', collection: 'users' })
        .then(() => {
          const users = [{ name: 'Ernest' }, { name: 'Wallace' }]

          fileStore
            .insert({ data: users, collection: 'users', schema: {} })
            .then(results => {
              results.constructor.name.should.eql('Array')
              results.length.should.eql(2)
              results[0].name.should.eql('Ernest')
              results[1].name.should.eql('Wallace')
              done()
            })
        })
    })

    it("should add _id property if one isn't specified", function(done) {
      const fileStore = new FileStoreAdapter()
      fileStore
        .connect({ database: 'content', collection: 'users' })
        .then(() => {
          const users = [{ name: 'Ernest' }, { name: 'Wallace' }]

          fileStore
            .insert({ data: users, collection: 'users', schema: {} })
            .then(results => {
              results.constructor.name.should.eql('Array')
              results.length.should.eql(2)
              results[0].name.should.eql('Ernest')
              should.exist(results[0]._id)
              done()
            })
        })
    })

    it('should use specified _id property if one is specified', function(done) {
      const fileStore = new FileStoreAdapter()
      fileStore
        .connect({ database: 'content', collection: 'users' })
        .then(() => {
          const users = [
            { _id: uuid.v4(), name: 'Ernest' },
            { name: 'Wallace' },
          ]

          fileStore
            .insert({ data: users, collection: 'users', schema: {} })
            .then(results => {
              results.constructor.name.should.eql('Array')
              results.length.should.eql(2)
              results[0].name.should.eql('Ernest')
              results[0]._id.should.eql(users[0]._id)
              done()
            })
        })
    })
  })

  describe('find', function() {
    it('should find a single document in the database', function(done) {
      const fileStore = new FileStoreAdapter()
      fileStore
        .connect({ database: 'content', collection: 'users' })
        .then(() => {
          const users = [{ name: 'Ernest' }, { name: 'Wallace' }]

          fileStore
            .insert({ data: users, collection: 'users', schema: {} })
            .then(results => {
              fileStore
                .find({
                  query: { name: 'Wallace' },
                  collection: 'users',
                  options: {},
                })
                .then(results => {
                  results.results.constructor.name.should.eql('Array')
                  results.results[0].name.should.eql('Wallace')
                  done()
                })
            })
        })
    })

    it('should return the number of records requested when using `limit`', function(done) {
      const fileStore = new FileStoreAdapter()
      fileStore
        .connect({ database: 'content', collection: 'users' })
        .then(() => {
          fileStore.getCollection('users').then(collection => {
            collection.clear()

            const users = [
              { name: 'BigBird' },
              { name: 'Ernie' },
              { name: 'Oscar' },
            ]

            fileStore
              .insert({ data: users, collection: 'users', schema: {} })
              .then(results => {
                fileStore
                  .find({
                    query: {},
                    collection: 'users',
                    options: { limit: 2 },
                  })
                  .then(results => {
                    results.results.constructor.name.should.eql('Array')
                    results.results.length.should.eql(2)
                    done()
                  })
                  .catch(err => {
                    done(err)
                  })
              })
              .catch(err => {
                done(err)
              })
          })
        })
    })

    it('should sort records in ascending order by the `$loki` property when no query or sort are provided', function(done) {
      const fileStore = new FileStoreAdapter()
      fileStore
        .connect({ database: 'content', collection: 'users' })
        .then(() => {
          fileStore.getCollection('users').then(collection => {
            collection.clear()

            const users = [
              { name: 'Ernie' },
              { name: 'Oscar' },
              { name: 'BigBird' },
            ]

            fileStore
              .insert({ data: users, collection: 'users', schema: {} })
              .then(results => {
                fileStore
                  .find({ query: {}, collection: 'users' })
                  .then(results => {
                    results.results.constructor.name.should.eql('Array')
                    results.results.length.should.eql(3)

                    results.results[0].name.should.eql('Ernie')
                    results.results[1].name.should.eql('Oscar')
                    results.results[2].name.should.eql('BigBird')
                    done()
                  })
                  .catch(err => {
                    done(err)
                  })
              })
              .catch(err => {
                done(err)
              })
          })
        })
    })

    it('should sort records in ascending order by the query property when no sort is provided', function(done) {
      const fileStore = new FileStoreAdapter()
      fileStore
        .connect({ database: 'content', collection: 'users' })
        .then(() => {
          fileStore.getCollection('users').then(collection => {
            collection.clear()

            const users = [
              { name: 'BigBird 3' },
              { name: 'BigBird 1' },
              { name: 'BigBird 2' },
            ]

            fileStore
              .insert({ data: users, collection: 'users', schema: {} })
              .then(results => {
                fileStore
                  .find({
                    query: { name: { $regex: 'Big' } },
                    collection: 'users',
                  })
                  .then(results => {
                    results.results.constructor.name.should.eql('Array')
                    results.results.length.should.eql(3)
                    results.results[0].name.should.eql('BigBird 3')
                    results.results[1].name.should.eql('BigBird 1')
                    results.results[2].name.should.eql('BigBird 2')
                    done()
                  })
                  .catch(err => {
                    done(err)
                  })
              })
              .catch(err => {
                done(err)
              })
          })
        })
    })

    it('should sort records in ascending order by the specified property', function(done) {
      const fileStore = new FileStoreAdapter()
      fileStore
        .connect({ database: 'content', collection: 'users' })
        .then(() => {
          fileStore.getCollection('users').then(collection => {
            collection.clear()

            const users = [
              { name: 'Ernie' },
              { name: 'Oscar' },
              { name: 'BigBird' },
            ]

            fileStore
              .insert({ data: users, collection: 'users', schema: {} })
              .then(results => {
                fileStore
                  .find({
                    query: {},
                    collection: 'users',
                    options: { sort: { name: 1 } },
                  })
                  .then(results => {
                    results.results.constructor.name.should.eql('Array')
                    results.results.length.should.eql(3)
                    results.results[0].name.should.eql('BigBird')
                    results.results[1].name.should.eql('Ernie')
                    results.results[2].name.should.eql('Oscar')
                    done()
                  })
                  .catch(err => {
                    done(err)
                  })
              })
              .catch(err => {
                done(err)
              })
          })
        })
    })

    it('should sort records in descending order by the specified property', function(done) {
      const fileStore = new FileStoreAdapter()
      fileStore
        .connect({ database: 'content', collection: 'users' })
        .then(() => {
          fileStore.getCollection('users').then(collection => {
            collection.clear()

            const users = [
              { name: 'Ernie' },
              { name: 'Oscar' },
              { name: 'BigBird' },
            ]

            fileStore
              .insert({ data: users, collection: 'users', schema: {} })
              .then(results => {
                fileStore
                  .find({
                    query: {},
                    collection: 'users',
                    options: { sort: { name: -1 } },
                  })
                  .then(results => {
                    results.results.constructor.name.should.eql('Array')
                    results.results.length.should.eql(3)
                    results.results[0].name.should.eql('Oscar')
                    results.results[1].name.should.eql('Ernie')
                    results.results[2].name.should.eql('BigBird')
                    done()
                  })
                  .catch(err => {
                    done(err)
                  })
              })
              .catch(err => {
                done(err)
              })
          })
        })
    })

    it('should return only the fields specified by the `fields` property (projection of type "includes")', function(done) {
      const fileStore = new FileStoreAdapter()
      fileStore
        .connect({ database: 'content', collection: 'users' })
        .then(() => {
          fileStore.getCollection('users').then(collection => {
            collection.clear()

            const users = [
              {
                name: 'Ernie',
                age: 7,
                colour: 'yellow',
              },
              {
                name: 'Oscar',
                age: 9,
                colour: 'green',
              },
              {
                name: 'BigBird',
                age: 13,
                colour: 'yellow',
              },
            ]

            fileStore
              .insert({ data: users, collection: 'users', schema: {} })
              .then(results => {
                fileStore
                  .find({
                    query: { colour: 'yellow' },
                    collection: 'users',
                    options: { sort: { name: 1 }, fields: { name: 1, age: 1 } },
                  })
                  .then(results => {
                    results.results.constructor.name.should.eql('Array')
                    results.results.length.should.eql(2)

                    const bigBird = results.results[0]
                    should.exist(bigBird.name)
                    should.exist(bigBird.age)
                    should.exist(bigBird._id)
                    should.not.exist(bigBird.colour)
                    done()
                  })
                  .catch(err => {
                    done(err)
                  })
              })
              .catch(err => {
                done(err)
              })
          })
        })
    })

    it('should return only the fields specified by the `fields` property (projection of type "excludes")', function(done) {
      const fileStore = new FileStoreAdapter()
      fileStore
        .connect({ database: 'content', collection: 'users' })
        .then(() => {
          fileStore.getCollection('users').then(collection => {
            collection.clear()

            const users = [
              {
                name: 'Ernie',
                age: 7,
                colour: 'yellow',
              },
              {
                name: 'Oscar',
                age: 9,
                colour: 'green',
              },
              {
                name: 'BigBird',
                age: 13,
                colour: 'yellow',
              },
            ]

            fileStore
              .insert({ data: users, collection: 'users', schema: {} })
              .then(results => {
                fileStore
                  .find({
                    query: { colour: 'yellow' },
                    collection: 'users',
                    options: { sort: { name: 1 }, fields: { age: 0 } },
                  })
                  .then(results => {
                    results.results.constructor.name.should.eql('Array')
                    results.results.length.should.eql(2)

                    const bigBird = results.results[0]
                    should.exist(bigBird.name)
                    should.not.exist(bigBird.age)
                    should.exist(bigBird._id)
                    should.exist(bigBird.colour)
                    done()
                  })
                  .catch(err => {
                    done(err)
                  })
              })
              .catch(err => {
                done(err)
              })
          })
        })
    })

    it('should return only the fields specified by the `fields` property when using nested properties (projection of type "includes")', function(done) {
      const fileStore = new FileStoreAdapter()
      fileStore
        .connect({ database: 'content', collection: 'users' })
        .then(() => {
          fileStore.getCollection('users').then(collection => {
            collection.clear()

            const users = [
              { name: 'Ernie', data: { age: 7, colour: 'yellow' } },
            ]

            fileStore
              .insert({ data: users, collection: 'users', schema: {} })
              .then(results => {
                fileStore
                  .find({
                    query: { name: 'Ernie' },
                    collection: 'users',
                    options: { sort: { name: 1 }, fields: { 'data.age': 1 } },
                  })
                  .then(results => {
                    results.results.constructor.name.should.eql('Array')
                    results.results.length.should.eql(1)

                    const bigBird = results.results[0]
                    should.exist(bigBird.data)
                    should.exist(bigBird.data.age)
                    should.exist(bigBird._id)
                    should.not.exist(bigBird.name)
                    should.not.exist(bigBird.data.colour)
                    done()
                  })
                  .catch(err => {
                    done(err)
                  })
              })
              .catch(err => {
                done(err)
              })
          })
        })
    })

    it('should return only the fields specified by the `fields` property when using nested properties (projection of type "excludes")', function(done) {
      const fileStore = new FileStoreAdapter()
      fileStore
        .connect({ database: 'content', collection: 'users' })
        .then(() => {
          fileStore.getCollection('users').then(collection => {
            collection.clear()

            const users = [
              { name: 'Ernie', data: { age: 7, colour: 'yellow' } },
            ]

            fileStore
              .insert({ data: users, collection: 'users', schema: {} })
              .then(results => {
                fileStore
                  .find({
                    query: { name: 'Ernie' },
                    collection: 'users',
                    options: { sort: { name: 1 }, fields: { 'data.age': 0 } },
                  })
                  .then(results => {
                    results.results.constructor.name.should.eql('Array')
                    results.results.length.should.eql(1)

                    const bigBird = results.results[0]
                    should.exist(bigBird.data)
                    should.not.exist(bigBird.data.age)
                    should.exist(bigBird._id)
                    should.not.exist(bigBird.name)
                    should.exist(bigBird.data.colour)
                    done()
                  })
                  .catch(err => {
                    done(err)
                  })
              })
              .catch(err => {
                done(err)
              })
          })
        })
    })
  })

  // Operator tests for:
  // '$eq'
  // $in'
  // '$lte'
  // '$lt'
  // '$gte'
  // '$gt'
  describe('query operators', function() {
    it('should handle all query operators', done => {
      const fileStore = new FileStoreAdapter()

      fileStore
        .connect({ database: 'content', collection: 'users' })
        .then(() => {
          fileStore.getCollection('users').then(collection => {
            collection.clear()

            const users = [
              { name: 'Ernie', age: 7, colour: 'yellow' },
              { name: 'BigBird', age: 17, colour: 'yellow' },
              { name: 'Bert', age: 9, colour: 'orange' },
            ]

            fileStore
              .insert({ data: users, collection: 'users', schema: {} })
              .then(results => {
                const queue = []
                queue.push({ name: 'Ernie' })
                queue.push({ colour: { $eq: 'yellow' } })
                queue.push({ age: { $in: [7, 9] } })
                queue.push({ age: { $lt: 9 } })
                queue.push({ age: { $lte: 9 } })
                queue.push({ age: { $gt: 9 } })
                queue.push({ age: { $gte: 7 } })

                function testFn(query) {
                  return fileStore.find({
                    query: query,
                    collection: 'users',
                    options: {},
                    schema: {},
                    settings: {},
                  })
                }

                promiseQueue(queue, testFn, {
                  interval: 300,
                }).then(results => {
                  let result = results[0].results[0]
                  if (result && result.name === 'Ernie') {
                    console.log(' = OK')
                  } else {
                    done(
                      new Error(
                        'Implicit equality query failed with ' +
                          JSON.stringify(result)
                      )
                    )
                  }

                  result = results[1].results[0]
                  if (result && result.colour === 'yellow') {
                    console.log(' $eq OK')
                  } else {
                    done(
                      new Error(
                        '$eq query failed with ' + JSON.stringify(result)
                      )
                    )
                  }

                  result = results[2].results
                  if (
                    result &&
                    result.length === 2 &&
                    (result[0].age === 7 || result[1].age === 9)
                  ) {
                    console.log(' $in OK')
                  } else {
                    done(
                      new Error(
                        '$in query failed with ' + JSON.stringify(result)
                      )
                    )
                  }

                  result = results[3].results
                  if (result && result.length === 1 && result[0].age === 7) {
                    console.log(' $lt OK')
                  } else {
                    done(
                      new Error(
                        '$lt query failed with ' + JSON.stringify(result)
                      )
                    )
                  }

                  result = results[4].results
                  if (
                    result &&
                    result.length === 2 &&
                    (result[0].age === 7 || result[1].age === 9)
                  ) {
                    console.log(' $lte OK')
                  } else {
                    done(
                      new Error(
                        '$lte query failed with ' + JSON.stringify(result)
                      )
                    )
                  }

                  result = results[5].results
                  if (result && result.length === 1 && result[0].age === 17) {
                    console.log(' $gt OK')
                  } else {
                    done(
                      new Error(
                        '$gt query failed with ' + JSON.stringify(result)
                      )
                    )
                  }

                  result = results[6].results
                  if (result && result.length === 3) {
                    console.log(' $gte OK')
                  } else {
                    done(
                      new Error(
                        '$gte query failed with ' + JSON.stringify(result)
                      )
                    )
                  }

                  done()
                })
              })
          })
        })
        .catch(err => {
          done(err)
        })
    })
  })

  describe('update', function() {
    describe('$set', function() {
      it('should update documents matching the query', function(done) {
        const fileStore = new FileStoreAdapter()
        fileStore
          .connect({ database: 'content', collection: 'users' })
          .then(() => {
            fileStore.getCollection('users').then(collection => {
              collection.clear()

              const users = [
                { name: 'Ernie', age: 7, colour: 'yellow' },
                { name: 'Oscar', age: 9, colour: 'green' },
                { name: 'BigBird', age: 13, colour: 'yellow' },
              ]

              fileStore
                .insert({ data: users, collection: 'users', schema: {} })
                .then(results => {
                  fileStore
                    .update({
                      query: { colour: 'green' },
                      collection: 'users',
                      update: { $set: { colour: 'yellow' } },
                    })
                    .then(results => {
                      fileStore
                        .find({
                          query: { colour: 'yellow' },
                          collection: 'users',
                          options: {},
                        })
                        .then(results => {
                          results.results.constructor.name.should.eql('Array')
                          results.results.length.should.eql(3)
                          done()
                        })
                        .catch(err => {
                          done(err)
                        })
                    })
                    .catch(err => {
                      done(err)
                    })
                })
                .catch(err => {
                  done(err)
                })
            })
          })
      })
    })

    describe('$inc', function() {
      it('should update documents matching the query', function(done) {
        const fileStore = new FileStoreAdapter()
        fileStore
          .connect({ database: 'content', collection: 'users' })
          .then(() => {
            fileStore.getCollection('users').then(collection => {
              collection.clear()

              const users = [
                { name: 'Ernie', age: 7, colour: 'yellow' },
                { name: 'Oscar', age: 9, colour: 'green' },
                { name: 'BigBird', age: 13, colour: 'yellow' },
              ]

              fileStore
                .insert({ data: users, collection: 'users', schema: {} })
                .then(results => {
                  fileStore
                    .update({
                      query: { colour: 'green' },
                      collection: 'users',
                      update: { $inc: { age: 10 } },
                    })
                    .then(results => {
                      fileStore
                        .find({
                          query: { colour: 'green' },
                          collection: 'users',
                          options: {},
                        })
                        .then(results => {
                          results.results.constructor.name.should.eql('Array')
                          results.results.length.should.eql(1)
                          results.results[0].age.should.eql(19)
                          done()
                        })
                        .catch(err => {
                          done(err)
                        })
                    })
                    .catch(err => {
                      done(err)
                    })
                })
                .catch(err => {
                  done(err)
                })
            })
          })
      })
    })

    describe('$push', function() {
      it('should update documents matching the query', function(done) {
        const fileStore = new FileStoreAdapter()
        fileStore
          .connect({ database: 'content', collection: 'users' })
          .then(() => {
            fileStore.getCollection('users').then(collection => {
              collection.clear()

              const users = [
                { name: 'Ernie', colours: ['yellow'] },
                { name: 'Oscar', colours: ['green'] },
                { name: 'BigBird', colours: ['yellow'] },
              ]

              fileStore
                .insert({ data: users, collection: 'users', schema: {} })
                .then(results => {
                  fileStore
                    .update({
                      query: { name: 'Ernie' },
                      collection: 'users',
                      update: { $push: { colours: 'red' } },
                    })
                    .then(results => {
                      fileStore
                        .find({
                          query: { name: 'Ernie' },
                          collection: 'users',
                          options: {},
                        })
                        .then(results => {
                          results.results.constructor.name.should.eql('Array')
                          results.results.length.should.eql(1)
                          results.results[0].colours.should.be.Array
                          results.results[0].colours[0].should.eql('yellow')
                          results.results[0].colours[1].should.eql('red')
                          done()
                        })
                        .catch(err => {
                          done(err)
                        })
                    })
                    .catch(err => {
                      done(err)
                    })
                })
                .catch(err => {
                  done(err)
                })
            })
          })
      })
    })
  })

  describe('delete', function() {
    it('should delete documents matching the query', function(done) {
      const fileStore = new FileStoreAdapter()
      fileStore
        .connect({ database: 'content', collection: 'users' })
        .then(() => {
          fileStore.getCollection('users').then(collection => {
            collection.clear()

            const users = [
              { name: 'Ernie', age: 7, colour: 'yellow' },
              { name: 'Oscar', age: 9, colour: 'green' },
              { name: 'BigBird', age: 13, colour: 'yellow' },
            ]

            fileStore
              .insert({ data: users, collection: 'users', schema: {} })
              .then(results => {
                fileStore
                  .delete({ query: { colour: 'green' }, collection: 'users' })
                  .then(results => {
                    fileStore
                      .find({ query: {}, collection: 'users', options: {} })
                      .then(results => {
                        results.results.constructor.name.should.eql('Array')
                        results.results.length.should.eql(2)
                        done()
                      })
                      .catch(err => {
                        done(err)
                      })
                  })
                  .catch(err => {
                    done(err)
                  })
              })
              .catch(err => {
                done(err)
              })
          })
        })
    })
  })

  describe('index', function() {
    it('should add indexes to the collection specified and return index names', function(done) {
      const fileStore = new FileStoreAdapter()
      fileStore
        .connect({ database: 'content', collection: 'users' })
        .then(() => {
          fileStore.getCollection('users').then(collection => {
            collection.clear()

            const indexes = [
              {
                keys: {
                  name: 1,
                },
              },
            ]

            fileStore
              .index(collection, indexes)
              .then(results => {
                results[0].index.should.eql('name')

                fileStore.getIndexes(collection).then(results => {
                  results[0].name.should.eql('name')
                  done()
                })
              })
              .catch(err => {
                done(err)
              })
          })
        })
    })
  })

  describe('database', function() {
    it('should contain all collections that have been inserted into', function(done) {
      const fileStore = new FileStoreAdapter()
      fileStore
        .connect({ database: 'content', collection: 'users' })
        .then(() => {
          const user = { name: 'David' }

          fileStore
            .insert({ data: user, collection: 'users', schema: {} })
            .then(results => {
              results.constructor.name.should.eql('Array')
              results[0].name.should.eql('David')

              fileStore
                .connect({ database: 'content', collection: 'posts' })
                .then(() => {
                  const post = { title: 'David on Holiday' }

                  fileStore
                    .insert({ data: post, collection: 'posts', schema: {} })
                    .then(results => {
                      results.constructor.name.should.eql('Array')
                      results[0].title.should.eql('David on Holiday')

                      fileStore.getCollection('users').then(collection => {
                        should.exist(collection)

                        fileStore.getCollection('posts').then(collection => {
                          should.exist(collection)

                          done()
                        })
                      })
                    })
                    .catch(err => {
                      done(err)
                    })
                })
                .catch(err => {
                  done(err)
                })
            })
        })
    })

    it('should handle connection to multiple databases', function(done) {
      const contentStore = new FileStoreAdapter()
      const authStore = new FileStoreAdapter()

      contentStore.connect({ database: 'content' }).then(() => {
        authStore.connect({ database: 'auth' }).then(() => {
          contentStore
            .insert({ data: { name: 'Jim' }, collection: 'users', schema: {} })
            .then(results => {
              authStore
                .insert({
                  data: { token: '123456123456123456123456' },
                  collection: 'token-store',
                  schema: {},
                })
                .then(results => {
                  contentStore
                    .find({
                      query: { name: 'Jim' },
                      collection: 'users',
                      options: {},
                    })
                    .then(results => {
                      results.results.constructor.name.should.eql('Array')
                      results.results[0].name.should.eql('Jim')

                      authStore
                        .find({
                          query: { token: '123456123456123456123456' },
                          collection: 'token-store',
                          options: {},
                        })
                        .then(results => {
                          results.results.constructor.name.should.eql('Array')
                          results.results[0].token.should.eql(
                            '123456123456123456123456'
                          )
                          done()
                        })
                    })
                })
            })
        })
      })
    })

    it('should clear collections when calling dropDatabase', function(done) {
      const fileStore = new FileStoreAdapter()
      fileStore
        .connect({ database: 'content', collection: 'users' })
        .then(() => {
          fileStore.getCollection('users').then(collection => {
            collection.clear()

            const users = [
              { name: 'Ernie' },
              { name: 'Oscar' },
              { name: 'BigBird' },
            ]

            fileStore
              .insert({ data: users, collection: 'users', schema: {} })
              .then(results => {
                fileStore.dropDatabase('users').then(() => {
                  fileStore
                    .find({ query: {}, collection: 'users' })
                    .then(results => {
                      results.results.constructor.name.should.eql('Array')
                      results.results.length.should.eql(0)
                      done()
                    })
                    .catch(err => {
                      done(err)
                    })
                })
              })
              .catch(err => {
                done(err)
              })
          })
        })
    })
  })
})
