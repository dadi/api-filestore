var EventEmitter = require('events').EventEmitter
var FileStoreAdapter = require('../lib')
var fs = require('fs')
var path = require('path')
var querystring = require('querystring')
var should = require('should')
var url = require('url')

var config = require(__dirname + '/../config')

describe('FileStore', function () {
  this.timeout(15000)

  beforeEach(function (done) {
    done()
  })

  afterEach(function(done) {
    setTimeout(function() {
      done()
    }, 1000)
  })

  after(function (done) {
    console.log('Finished, waiting for database to be written to disk...')
    setTimeout(function() {
      try {
        fs.unlinkSync(path.resolve(path.join(config.get('database.path'), 'auth.db')))
        fs.unlinkSync(path.resolve(path.join(config.get('database.path'), 'content.db')))
        fs.rmdirSync(path.resolve(config.get('database.path')))
        fs.rmdirSync(path.resolve(config.get('database.path') + '2'))
      } catch(err) {
        console.log(err)
      }

      done()
    }, 7000)
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

    it('should load config if no options supplied', function (done) {
      var fileStore = new FileStoreAdapter()
      should.exist(fileStore.config)
      fileStore.config.database.path.should.eql('test/workspace')
      done()
    })

    it('should load config from options supplied', function (done) {
      var fileStore = new FileStoreAdapter({ database: { path: 'test/workspace2' } })
      should.exist(fileStore.config)
      fileStore.config.database.path.should.eql('test/workspace2')
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
      fileStore.connect({ database: 'content' })
      should.exist(fileStore.database)
      done()
    })

    it('should have readyState == 1 when connected', function (done) {
      var fileStore = new FileStoreAdapter()
      fileStore.connect({ database: 'content', collection: 'posts' }).then(() => {
        fileStore.readyState.should.eql(1)
        done()
      })
    })
  })

  describe('insert', function () {
    it('should insert a single document into the database', function (done) {
      var fileStore = new FileStoreAdapter()
      fileStore.connect({ database: 'content', collection: 'users' }).then(() => {
        var user = { name: 'David' }

        fileStore.insert(user, 'users', {}).then((results) => {
          results.constructor.name.should.eql('Array')
          results[0].name.should.eql('David')
          done()
        })
      })
    })

    it('should insert an array of documents into the database', function (done) {
      var fileStore = new FileStoreAdapter()
      fileStore.connect({ database: 'content', collection: 'users' }).then(() => {
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
      fileStore.connect({ database: 'content', collection: 'users' }).then(() => {
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

  describe('database', function () {
    it('should contain all collections that have been inserted into', function (done) {
      var fileStore = new FileStoreAdapter()
      fileStore.connect({ database: 'content', collection: 'users' }).then(() => {
        var user = { name: 'David' }

        fileStore.insert(user, 'users', {}).then((results) => {
          results.constructor.name.should.eql('Array')
          results[0].name.should.eql('David')

          fileStore.connect({ database: 'content', collection: 'posts' }).then(() => {
            var post = { title: 'David on Holiday' }

            fileStore.insert(post, 'posts', {}).then((results) => {
              results.constructor.name.should.eql('Array')
              results[0].title.should.eql('David on Holiday')

              var u = fileStore.database.getCollection('users')
              var p = fileStore.database.getCollection('posts')
              should.exist(u)
              should.exist(p)
              done()
            }).catch((err) => {
              done(err)
            })
          }).catch((err) => {
            done(err)
          })
        })
      })
    })

    it('should handle connection to multiple databases', function (done) {
      var contentStore = new FileStoreAdapter()
      var authStore = new FileStoreAdapter()

      contentStore.connect({ database: 'content' }).then(() => {
        authStore.connect({ database: 'auth' }).then(() => {
          contentStore.insert({ name: 'Jim' }, 'users', {}).then((results) => {
            authStore.insert({ token: '123456123456123456123456' }, 'token-store', {}).then((results) => {
              contentStore.find({ name: 'Jim' }, 'users', {}).then((results) => {
                results.constructor.name.should.eql('Array')
                results[0].name.should.eql('Jim')

                authStore.find({ token: '123456123456123456123456' }, 'token-store', {}).then((results) => {
                  results.constructor.name.should.eql('Array')
                  results[0].token.should.eql('123456123456123456123456')
                  done()
                })
              })
            })
          })
        })
      })
    })
  })
})
