var EventEmitter = require('events').EventEmitter
var FileStoreAdapter = require('../../lib')
var fs = require('fs')
var path = require('path')
var querystring = require('querystring')
var should = require('should')
var url = require('url')

var config = require(__dirname + '/../../config')

describe('FileStore', function () {
  this.timeout(2000)

  beforeEach(function (done) {
    done()
  })

  afterEach(function(done) {
    setTimeout(function() {
      var dbPath = path.resolve(config.get('path'))
      try {
        fs.unlinkSync(dbPath)
        done()
      } catch (err) {
        done()
      }
    }, 500)
  })

  describe('constructor', function () {
    it('should be exposed', function (done) {
      FileStoreAdapter.should.be.Function
      done()
    })

    it('should inherit from EventEmitter', function (done) {
      var fileStore = new FileStoreAdapter()
      fileStore.should.be.an.instanceOf(EventEmitter)
      fileStore.emit.should.be.Function
      done()
    })

    it.skip('should load config if no options supplied', function (done) {
      var fileStore = new FileStoreAdapter()
      should.exist(fileStore.config)
      fileStore.config.path.should.eql('workspace/test.db')
      done()
    })

    it('should load config from options supplied', function (done) {
      var fileStore = new FileStoreAdapter({ path: 'workspace/testxx.db' })
      should.exist(fileStore.config)
      fileStore.config.path.should.eql('workspace/testxx.db')
      done()
    })

    it('should have readyState == 0 when initialised', function (done) {
      var fileStore = new FileStoreAdapter()
      fileStore.readyState.should.eql(0)
      done()
    })
  })

  describe('connect', function () {
    it('should create and return database when connecting', function (done) {
      var fileStore = new FileStoreAdapter()
      fileStore.connect()
      should.exist(fileStore.database)
      done()
    })

    it('should create specified collection if it doesn\'t exist', function (done) {
      var fileStore = new FileStoreAdapter()

      fileStore.connect({ collection: 'users' }).then(() => {
        var collection = fileStore.database.getCollection('users')
        should.exist(collection)
        collection.name.should.eql('users')
        done()
      })
    })

    it('should have readyState == 1 when connected', function (done) {
      var fileStore = new FileStoreAdapter()
      fileStore.connect({ collection: 'posts' }).then(() => {
        fileStore.readyState.should.eql(1)
        done()
      })
    })
  })

  describe('insert', function () {
    it('should insert a single document into the database', function (done) {
      var fileStore = new FileStoreAdapter()
      fileStore.connect({ collection: 'users' }).then(() => {
        var user = { name: 'Ernest' }

        fileStore.insert(user, 'users', {}).then((results) => {
          results.constructor.name.should.eql('Array')
          results[0].name.should.eql('Ernest')
          done()
        })
      })
    })

    it('should insert an array of documents into the database', function (done) {
      var fileStore = new FileStoreAdapter()
      fileStore.connect({ collection: 'users' }).then(() => {
        var users = [{ name: 'Ernest' }, { name: 'Wallace' }]

        fileStore.insert(users, 'users', {}).then((results) => {
          results.constructor.name.should.eql('Array')
          results.length.should.eql(2)
          results[0].name.should.eql('Ernest')
          results[1].name.should.eql('Wallace')
          done()
        })
      })
    })
  })

  describe('find', function () {
    it('should find a single document in the database', function (done) {
      var fileStore = new FileStoreAdapter()
      fileStore.connect({ collection: 'users' }).then(() => {
        var users = [{ name: 'Ernest' }, { name: 'Wallace' }]

        fileStore.insert(users, 'users', {}).then((results) => {
          fileStore.find({ name: 'Wallace' }, 'users', {}).then((results) => {
            results.constructor.name.should.eql('Array')
            results[0].name.should.eql('Wallace')
            done()
          })
        })
      })
    })
  })
})
