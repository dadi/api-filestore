var convict = require('convict')

var conf = convict({
  env: {
    doc: "The applicaton environment.",
    format: ["production", "development", "test", "qa"],
    default: "development",
    env: "NODE_ENV",
    arg: "node_env"
  },
  database: {
    path: {
      doc: "",
      format: String,
      default: "workspace/test.db"
    },
    autosaveInterval: {
      doc: "",
      format: Number,
      default: 5000
    },
    serializationMethod: {
      doc: "",
      format: ['normal', 'pretty'],
      default: 'normal'
    }
  }
})

// Load environment dependent configuration
var env = conf.get('env')
conf.loadFile('./config/filestore.' + env + '.json')

conf.validate({strict: false})

module.exports = conf
