# API FileStore Adapter

[![npm (scoped)](https://img.shields.io/npm/v/@dadi/api-filestore.svg?maxAge=10800&style=flat-square)](https://www.npmjs.com/package/@dadi/api-filestore)
[![coverage](https://img.shields.io/badge/coverage-93%25-brightgreen.svg?style=flat-square)](https://github.com/dadi/api-filestore)
[![Build Status](https://travis-ci.org/dadi/api-filestore.svg?branch=master)](https://travis-ci.org/dadi/api-filestore)
[![JavaScript Style Guide](https://img.shields.io/badge/code%20style-standard-brightgreen.svg?style=flat-square)](http://standardjs.com/)
[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg?style=flat-square)](https://github.com/semantic-release/semantic-release)

## Requirements

* [DADI API](https://www.npmjs.com/package/@dadi/api) Version 2.0.0 or greater

## Usage

To use this adapter with your DADI API installation, you'll need to add it to your API's dependencies:

```bash
$ cd my-api
$ npm install --save @dadi/api-filestore
```

## Tests

Run the tests:

```bash
$ git clone https://github.com/dadi/api-filestore.git
$ cd api-filestore
$ npm test
```

## Configure

### Configuration Files

Configuration settings are defined in JSON files within a `/config` directory at the root of your API application. DADI API has provision for multiple configuration files, one for each environment that your API is expected to run under: `development`, `qa` and `production`.

The naming convention for filestore configuration files follows the format `filestore.<environment>.json`

For example:

```
filestore.development.json
filestore.qa.json
filestore.production.json
```

### Application Anatomy

```sh
my-api/
  config/            # contains environment-specific
                     # configuration properties
    config.development.json
    config.qa.json
    config.production.json
    filestore.development.json
    filestore.qa.json
    filestore.production.json

  main.js            # the entry point of the app

  package.json

  workspace/
    collections/     # collection schema files
    endpoints/       # custom Javascript endpoints

```

### Configuration

```
{
  "database": {
    "path": "path/to/your/database(s)",
    "autosaveInterval": 1000,
    "serializationMethod": "pretty"
  }
}
```

Property | Description | Default
:--------|:------------|:-------
path | The relative or absolute path to where your database files will be stored | none
autosaveInterval | The interval, in milliseconds, between database writes to disk | 5000 (5 seconds)
serializationMethod | The format of the database file on disk. `normal` is a condensed version of the JSON, `pretty` is more readable | `normal`

### Querying Collections

#### $eq

```js
// explicit
{'Name': { '$eq' : 'Odin' }}

// implicit (assumes equality operator)
{'Name': 'Odin'}
```

#### $ne

not equal test

```js
{'legs': { '$ne' : 8 }}
```

#### $regex

```js
// pass in raw regex
var results = coll.find({'Name': { '$regex' : /din/ }});

// or pass in string pattern only
results = coll.find({'Name': { '$regex': 'din' }});

// or pass in [pattern, options] string array
results = coll.find({'Name': { '$regex': ['din', 'i'] }});
```

If using regex operator within a named transform or dynamic view filter, it is best to use the latter two examples since raw regex does not seem to serialize/deserialize well.

#### $in

```js
var users = db.addCollection("users");
users.insert({ name : 'odin' });
users.insert({ name : 'thor' });
users.insert({ name : 'svafrlami' });

// match users with name in array set ['odin' or 'thor']
{ 'name' : { '$in' : ['odin', 'thor'] } }
```

#### $between

```js
// match users with count value between 50 and 75
{ count : { '$between': [50, 75] } }
```

#### $contains / $containsAny / $containsNone

```js
var users = db.addCollection("users");
users.insert({ name : 'odin', weapons : ['gungnir', 'draupnir']});
users.insert({ name : 'thor', weapons : ['mjolnir']});
users.insert({ name : 'svafrlami', weapons : ['tyrfing']});
users.insert({ name : 'arngrim', weapons : ['tyrfing']});

// returns 'svafrlami' and 'arngrim' documents
{ 'weapons' : { '$contains' : 'tyrfing' } }

// returns 'svafrlami', 'arngrim', and 'thor' documents
{ 'weapons' : { '$containsAny' : ['tyrfing', 'mjolnir'] } }

// returns 'svafrlami' and 'arngrim'
{ 'weapons' : { '$containsNone' : ['gungnir', 'mjolnir'] } }

```

### Composing Nested Queries

#### $and
fetch documents matching both sub-expressions

```js
{
  '$and': [{
      'Age' : {
        '$gt': 30
      }
    },{
      'Name' : 'Thor'
    }]
}
```

#### $or
fetch documents matching any of the sub-expressions

```js
{
  '$or': [{
      'Age' : {
        '$gte': '40'
      }
    },{
      'Name' : 'Thor'
    }]
}
```