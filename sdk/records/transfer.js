// TODO: provide a way to parse the transfer from buffer and json

let common = require('../util/common.js');
let assert = require('../util/assert.js');
let varint = require('../util/varint.js');
let binary = require('../util/binary-packing.js');
let _ = require('lodash');

let keyHandlers = require('../key-types/key-handlers.js');
let config = require('../config.js');

let Issue = require('./issue.js');
let AccountNumber = require('../account-number.js');

function resetSignState(issue) {
  issue._txId = null;
  issue._isSigned = false;
}

function Transfer() {
  if (!(this instanceof Transfer)) {
    return new Transfer();
  }
  resetSignState(this);
}

// let _getMostReturnedResult = function(resultSet, key) {
//   let results = {}, finalResult = null;
//   resultSet.forEach(function(result){
//     result = result[key];
//     results[result] = (results[result] || 0) + 1;
//     if (!finalResult || results[result] > results[finalResult]) {
//       finalResult = result;
//     }
//   });
//   return finalResult;
// };

let _packRecord = function(transfer) {
  let txBuffer;
  txBuffer = varint.encode(config.record.transfer.value);
  txBuffer = binary.appendBuffer(txBuffer, new Buffer(transfer._preTx, 'hex'));
  if (transfer._payment) {
    txBuffer = Buffer.concat([txBuffer, new Buffer([0x01])]);
    txBuffer = Buffer.concat([txBuffer, varint.encode(config.currency[transfer._payment.currency])]);
    txBuffer = binary.appendString(txBuffer, transfer._payment.address);
    txBuffer = Buffer.concat([txBuffer, varint.encode(config.currency[transfer._payment.amount])]);
  } else {
    txBuffer = Buffer.concat([txBuffer, new Buffer([0x00])]);
  }
  txBuffer = binary.appendBuffer(txBuffer, transfer._owner.pack());
  return txBuffer;
};

Transfer.prototype.fromTx = function(preTx){
  assert(preTx, 'Transfer error: previous transaction is required');
  if (_.isString(preTx)) {
    this._preTx = preTx;
  } else if (preTx instanceof Issue || preTx instanceof Transfer) {
    this._preTx = preTx.getId();
    this._preOwner = preTx.getOwner();
    assert(this._preTx, 'Transfer error: can not get the id of the previous transaction');
  } else {
    throw new TypeError('Transfer error: can not recognize input type');
  }
  resetSignState(this);
  return this;
};

Transfer.prototype.toAccountNumber = function(accountNumber) {
  if (_.isString(accountNumber)) {
    accountNumber = new AccountNumber(accountNumber);
  }
  assert(accountNumber instanceof AccountNumber, 'Transfer error: can not recognize input type');
  if (this._preOwner) {
    assert(accountNumber.getNetwork() === this._preOwner.getNetwork(), 'Transfer error: trying to transfer bitmark to different network');
  }
  this._owner = accountNumber;
  resetSignState(this);
  return this;
};

Transfer.prototype.requirePayment = function(options) {
  assert(options, 'Transfer error: payment info is required');
  assert(options.address, 'Transfer error: payment address is required');
  assert(options.currency && config.currency[options.currency], 'Transfer error: a valid currency for payment is required');
  assert(options.amount, 'Transfer error: payment amount is required');
  this._payment = {
    address: options.address,
    currency: options.currency,
    amount: options.amount
  };
  resetSignState(this);
  return this;
};

Transfer.prototype.sign = function(priKey){
  let preOwner;

  assert(this._preTx, 'Transfer error: missing previous transaction');
  assert(this._owner, 'Transfer error: missing new owner');

  preOwner = priKey.getAccountNumber();
  if (this._preOwner) {
    assert(preOwner.toString() === this._preOwner.toString(), 'Transfer error: wrong key');
  } else {
    this._preOwner = preOwner;
  }
  assert(this._owner.getNetwork() === this._preOwner.getNetwork(), 'Transfer error: trying to transfer bitmark to different network');

  let keyHandler = keyHandlers.getHandler(priKey.getType());
  let recordPacked = _packRecord(this);
  this._signature = keyHandler.sign(recordPacked, priKey.toBuffer());
  this._isSigned = true;

  recordPacked = binary.appendBuffer(recordPacked, this._signature);
  this._txId = common.sha3_256(recordPacked).toString('hex');
  return this;
};

Transfer.prototype.toJSON = function(){
  assert(this._isSigned, 'Transfer error: need to sign the record before getting JSON format');
  let result = {
    owner: this._owner.toString(),
    signature: this._signature.toString('hex'),
    link: this._preTx
  };
  if (this._payment) {
    result.payment = this._payment;
  }
  return result;
};

Transfer.prototype.isSigned = function() { return this._isSigned; };
Transfer.prototype.getPreTxId = function() { return this._preTx; };
Transfer.prototype.getId = function() { return this._txId; };
Transfer.prototype.getSignature = function(){ return this._signature; };
Transfer.prototype.getOwner = function() { return this._owner; };

module.exports = Transfer;