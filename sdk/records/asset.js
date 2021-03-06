// TODO: provide a way to parse the asset from buffer and json

let common = require('../util/common.js');
let assert = require('../util/assert.js');
let varint = require('../util/varint.js');
let binary = require('../util/binary-packing.js');
let _ = require('lodash');

let keyHandlers = require('../key-types/key-handlers.js');
let config = require('../config.js');

function resetSignState(asset) {
  asset._isSigned = false;
}

function Asset() {
  if (!(this instanceof Asset)) {
    return new Asset();
  }
  this._metadata = {};
  resetSignState(this);
}

// function _getMostReturnedResult(resultSet, key) {
//   let results = {}, finalResult = null;
//   resultSet.forEach(function(result){
//     result = result[key];
//     results[result] = (results[result] || 0) + 1;
//     if (!finalResult || results[result] > results[finalResult]) {
//       finalResult = result;
//     }
//   });
//   return finalResult;
// }

function _setString(val, length, name, asset) {
  assert(_.isString(val), new TypeError('Asset error: ' + name + ' must be a string'));
  val = common.normalizeStr(val);
  assert(val.length <= length, 'Asset error: ' + name + ' must be less than ' + length);
  if (asset['_' + name] !== val) {
    asset['_' + name] = val;
    asset._isSigned = false;
  }
  return asset;
}

function _packRecord(asset) {
  let txBuffer;
  txBuffer = varint.encode(config.record.asset.value);
  txBuffer = binary.appendString(txBuffer, asset._name);
  txBuffer = binary.appendString(txBuffer, asset._fingerprint);
  txBuffer = binary.appendString(txBuffer, mapToMetadataString(asset._metadata));
  txBuffer = binary.appendBuffer(txBuffer, asset._registrant.pack());
  return txBuffer;
}

Asset.prototype.setName = function(name){
  _setString(name, config.record.asset.max_name, 'name', this);
  resetSignState(this);
  return this;
};


let metadataSeparator = String.fromCharCode(parseInt('\u0000',16));

function mapToMetadataString(map) {
  let tmp = [];
  for (let key in map) {
    tmp.push(key, map[key]);
  }
  return tmp.join(metadataSeparator);
}

function stringToMetadataMap(str) {
  let tmp = str.split(metadataSeparator);
  if (tmp.length % 2) {
    throw new Error('Asset error: can not parse string to metadata');
  }

  let map = {};
  for (let i = 0, length = tmp.length; i < length; i += 2) {
    map[tmp[i]] = tmp[i+1];
  }
  return map;
}

function isValidMetadataLength(metadata) {
  let metadataString = mapToMetadataString(metadata);
  return metadataString.length <= config.record.asset.max_metadata;
}

function assertMetadataLength(metadata) {
  let valid = _.isString(metadata) ? metadata.length <= config.record.asset.max_metadata :  isValidMetadataLength(metadata);
  assert(valid, new Error('Asset error: metadata is too long'));
}

Asset.isValidMetadata = function(metadataMap) {
  return isValidMetadataLength(metadataMap);
};

Asset.prototype.setMetadata = function(metadata) {
  metadata = metadata || {};

  assert(_.isPlainObject(metadata), 'Asset error: metadata needs to be in JSON format');
  assertMetadataLength(metadata);

  this._metadata = metadata;
  resetSignState(this);
  return this;
};

Asset.prototype.importMetadata = function(metadataString) {
  assertMetadataLength(metadataString);
  let metadata = stringToMetadataMap(metadataString);
  this._metadata = metadata;
  resetSignState(this);
  return this;
};

Asset.prototype.addMetadata = function(key, value) {
  let tmp = JSON.parse(JSON.stringify(this._metadata));
  tmp[key] = value;

  assertMetadataLength(tmp);
  this._metadata = tmp;
  resetSignState(this);
  return this;
};

Asset.prototype.removeMetadata = function(key) {
  delete this._metadata[key];
  resetSignState(this);
  return this;
};

Asset.prototype.getMetadata = function() {
  return this._metadata;
};

Asset.prototype.setFingerprint = function(fingerprint) {
  _setString(fingerprint, config.record.asset.max_fingerprint, 'fingerprint', this);
  this._id = computeAssetId(this._fingerprint);
  resetSignState(this);
  return this;
};

let computeAssetId = function(fingerprint) {
  return common.sha3_512(new Buffer(fingerprint, 'utf8')).toString('hex');
};

Asset.prototype.sign = function(priKey) {
  assert(this._name, 'Asset error: missing name');
  assert(this._fingerprint, 'Asset error: missing fingerprint');
  this._registrant = priKey.getAccountNumber();

  let keyHandler = keyHandlers.getHandler(priKey.getType());
  this._signature = keyHandler.sign(_packRecord(this), priKey.toBuffer());
  this._isSigned = true;
  return this;
};

Asset.prototype.toJSON = function() {
  assert(this._isSigned, 'Asset error: need to sign the record before getting JSON format');
  return {
    fingerprint: this._fingerprint,
    name: this._name,
    metadata: mapToMetadataString(this._metadata),
    registrant: this._registrant.toString(),
    signature: this._signature.toString('hex')
  };
};

Asset.prototype.isSigned = function() { return this._isSigned; };
Asset.prototype.getName = function() { return this._name; };
Asset.prototype.getMetadata = function() { return this._metadata; };
Asset.prototype.getFingerprint = function() { return this._fingerprint; };
Asset.prototype.getSignature = function() { return this._signature; };
Asset.prototype.getRegistrant = function() { return this._registrant; };
Asset.prototype.getId = function() { return this._id; };

module.exports = Asset;