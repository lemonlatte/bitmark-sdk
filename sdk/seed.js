'use strict';

let common = require('./util/common.js');
let varint = require('./util/varint.js');
let base58 = require('./util/base58.js');
let assert = require('./util/assert.js');
let _ = require('lodash');

let networks = require('./networks.js');
let config = require('./config.js');

let seedVersionEncoded = varint.encode(config.seed.version);

function SeedInfo(values) {
  this.getValues = function() { return values; }
}

function standardizeNetwork(network) {
  network = network || networks.livenet;
  if (_.isString(network)) {
    network = networks[network];
    assert(network, new TypeError('Seed error: can not recognize network'));
  }
  return network;
}

function standardzeVersion(version) {
  version = version || config.seed.version;
  if (version !== config.seed.version) {
    throw new Error('Seed error: this version is not supported');
  }
  return version;
}

function exportToString(core, network, version) {
  assert(core && Buffer.isBuffer(core) && core.length === config.core.length, new TypeError('Invalid core'));
  assert(network, new TypeError('Invalid network'));
  assert(version, new TypeError('Invalid version'));

  let networkValue = varint.encode(network.core_value);
  let versionValue = varint.encode(version);
  let exportedSeed = Buffer.concat([config.seed.magic, versionValue, networkValue, core]);
  let checksum = common.sha3_256(exportedSeed).slice(0, config.seed.checksum_length);
  exportedSeed = Buffer.concat([exportedSeed, checksum]);
  return base58.encode(exportedSeed);
}

function parseSeedString(seedString) {
  let seedStringBuffer, rest;
  try {
    seedStringBuffer = base58.decode(seedString);
  } catch (error) {
    throw new TypeError('Seed String is not in base58 format');
  }

  // Verify checksum
  let checksum, checksumVerification;
  checksum = seedStringBuffer.slice(seedStringBuffer.length - config.seed.checksum_length, seedStringBuffer.length);
  rest = seedStringBuffer.slice(0, seedStringBuffer.length - config.seed.checksum_length);
  checksumVerification = common.sha3_256(rest);
  checksumVerification = checksumVerification.slice(0, config.seed.checksum_length);
  if (!common.bufferEqual(checksum, checksumVerification)) {
    throw new Error('Invalid seed string: wrong checksum');
  }


  // Verify magic number
  let magicNumber;
  magicNumber = rest.slice(0, config.seed.magic.length);
  if (!common.bufferEqual(magicNumber, config.seed.magic)) {
    throw new Error('Invalid seed string: wrong app magic number');
  }
  rest = rest.slice(config.seed.magic.length);

  // Verify version
  let version;
  version = rest.slice(0, seedVersionEncoded.length);
  if (!common.bufferEqual(version, seedVersionEncoded)) {
    throw new Error('Invalid seed string: unrecognized version');
  }
  rest = rest.slice(seedVersionEncoded.length);

  let networkValue, network;
  networkValue = rest.slice(0, config.seed.network_length).readInt8(0);
  if (networkValue === networks.livenet.core_value) {
    network = networks.livenet;
  } else if (networkValue === networks.testnet.core_value) {
    network = networks.testnet;
  } else {
    throw new Error('Invalid seed string: can not recognize network value');
  }
  let core = rest.slice(config.seed.network_length);

  if (core.length !== config.core.length) {
    throw new Error('Invalid seed string: wrong core length');
  }

  return new SeedInfo({
    _core: core,
    _string: seedString,
    _network: network.name,
    _version: version.readUInt8(0)
  });
}

function Seed(network, version) {
  if (!(this instanceof Seed)) {
    return new Seed(network, version);
  }

  if (network instanceof SeedInfo) {
    common.addImmutableProperties(this, network.getValues());
    return;
  }

  throw new Error('Seed error: calling Seed constructor directly is now deprecated');
}

Seed.fromBase58 = Seed.fromString = function(seedString) {
  assert(_.isString(seedString), new TypeError('Seed error: Expect ' + seedString + ' to be a string'));
  return new Seed(parseSeedString(seedString));
}

Seed.fromCore = Seed.fromBuffer = function(core, network, version) {
  assert(Buffer.isBuffer(core), new TypeError('Seed error: core need to be a buffer'));
  assert(core.length === config.core.length, new TypeError(`Seed error: core need to be ${config.core.length} bytes`));

  network = standardizeNetwork(network);
  version = standardzeVersion(version);
  let seedInfo = new SeedInfo({
    _core: core,
    _string: exportToString(core, network, version),
    _network: network.name,
    _version: version
  });
  return new Seed(seedInfo);
}

Seed.isValid = function(seedString) {
  try {
    parseSeedString(seedString);
    return true;
  } catch (error) {
    return false;
  }
}

Seed.prototype.toBase58 = Seed.prototype.toString = function() { return this._string; };
Seed.prototype.getNetwork = function() { return this._network; };
Seed.prototype.getCore = Seed.prototype.toBuffer = function() { return this._core };
Seed.prototype.getVersion = function() { return this._version };

module.exports = exports = Seed;
