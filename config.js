const convict = require('convict')
const conf = convict({
  env: {
    doc: 'The applicaton environment.',
    format: ['production', 'development', 'test', 'qa'],
    default: 'development',
    env: 'NODE_ENV',
    arg: 'node_env'
  },
  connectWithCollection: {
    doc: 'Whether to use collection names as part of the connection string, generating a new database instance for each collection',
    format: Boolean,
    default: false
  },
  database: {
    path: {
      doc: 'Path to the database file',
      format: String,
      default: 'workspace/db'
    },
    autosaveInterval: {
      doc: 'Interval (in milliseconds) for persisting data to disk',
      format: Number,
      default: 5000
    },
    serializationMethod: {
      doc: 'LokiJS serialisation method',
      format: ['normal', 'pretty'],
      default: 'normal'
    }
  }
})

// Load environment dependent configuration.
conf.loadFile(`./config/filestore.${conf.get('env')}.json`)

module.exports = conf
