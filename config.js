var convict = require('convict')

// Define a schema
var conf = convict({
  env: {
    doc: "The applicaton environment.",
    format: ["production", "development", "test", "qa"],
    default: "development",
    env: "NODE_ENV",
    arg: "node_env"
  },
  path: {
    doc: "",
    format: String,
    default: "workspace/test.db"
  }
})

// Load environment dependent configuration
var env = conf.get('env')
conf.loadFile('./config/filestore.' + env + '.json')

// Perform validation
conf.validate({strict: false})

module.exports = conf
