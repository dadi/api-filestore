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
    doc: '',
    format: Boolean,
    default: false
  },
  database: {
    path: {
      doc: '',
      format: String,
      default: 'workspace/test.db'
    },
    autosaveInterval: {
      doc: '',
      format: Number,
      default: 5000
    },
    serializationMethod: {
      doc: '',
      format: ['normal', 'pretty'],
      default: 'normal'
    }
  }
})

// Load environment dependent configuration
conf.loadFile('./config/filestore.' + conf.get('env') + '.json')

module.exports = conf
