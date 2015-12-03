'use strict';

var _ = require('lodash');
var eventStream = require('event-stream');

var fields = ['Timestamp', 'Content', 'Amount'];

function EntryTable() {
}

EntryTable.prototype.one2doubleEntries = function(fieldMapping, getAccountingItem) {
  return eventStream.map(function(data, cb) {
    // normal mapping
    var doubleEntries = _([{ data: data, type: 'Dr' }, { data: data, type: 'Cr' }])
      .map(function normalMapping(one) {
        var entry = { ItemType: '' };

        _.forEach(fields, function(field) {
          entry[field] = one.data[fieldMapping[field]];
        });

        if (one.type === 'Dr') {
          entry['Dr.Amount'] = entry.Amount;
        } else {
          entry['Cr.Amount'] = entry.Amount;
        }

        delete entry.Amount;

        entry.Item = getAccountingItem(one.data, one.type);

        var itemTypeRegex = /^([^－]+)/;
        var result = itemTypeRegex.exec(entry.Item);

        if (result && result.length > 1) {
          entry.ItemType = result[1];
        }

        return entry;
      })
      .value();

      cb(null, doubleEntries);
  });
};

EntryTable.outputFields = ['Timestamp', 'Content', 'ItemType', 'Item', 'Dr.Amount', 'Cr.Amount'];

module.exports = EntryTable;
