'use strict';

var _ = require('lodash');
var eventStream = require('event-stream');
var iconv = require('iconv-lite');
var csv = require('csv');
var EntryTable = require('./entry-table');

var entryTable = new EntryTable();

// default option
var defaultOption = {
  startRegex: /-{3,}交易记录明细列表-{3,}/,
  endRegex: /^-{3,}$/,
  timestampField: '最近修改时间',
  contentField: '商品名称',
  valueField: '金额（元）',
  charset: 'GB18030',
  csvParseOption: {
    columns: true,
    trim: true,
    'skip_empty_lines': true
  }
};

function AlipayRecordParser(option) {
  this.option = _.defaults(option || {}, defaultOption);
  this.status = 'start';
  this.csvParseOption = this.option.csvParseOption;
  this.fieldMapping = {
    Timestamp: this.option.timestampField,
    Content: this.option.contentField,
    Amount: this.option.valueField
  };
}

AlipayRecordParser.prototype.decode = function () {
  return iconv.decodeStream(this.option.charset);
};

// 在这里过滤掉非csv信息
AlipayRecordParser.prototype.parse = function parse() {
  var self = this;

  var trunkStream = eventStream.map(function(data, cb){
    switch(self.status) {
    case 'start':
      if (self.option.startRegex.test(data)) {
        // 发现了CSV表格的起始
        self.status = 'csvHeader';
      }

      //console.log(data);
      cb();   // drop
      break;
    case 'csvHeader':
      var headers = _(data.split(',')).map(_.trim).value();
      self.csvParseOption.columns = headers;

      self.status = 'csv';
      cb(); //drop
      break;
    case 'csv':
      if (self.option.endRegex.test(data)) {
        // 发现了CSV表格的结束
        self.status = 'ending';
        cb();   // drop
      } else {
        csv.parse(data, self.csvParseOption, function(err, rows) {
          _.forEach(rows, function(row) {
            cb(err, row);
          });
        });
      }
      break;
    case 'ending':
      //console.log(data);
      cb();   // drop
      break;
    default:
      throw new Error('Unsupported status');
    }
  });

  return trunkStream;
};

var filterDropPatterns = {
  '交易状态': [
    /交易关闭/
   ]
};

var isMatchDropPatterns = function(data) {
  return _(filterDropPatterns).any(function(v, k) {
    return _(v).any(function(pattern) {
      return pattern.test(data[k])
    });
  })
}

AlipayRecordParser.prototype.filter = function() {
  return eventStream.map(function(data, cb) {
    if (isMatchDropPatterns(data)) {
      cb(); //drop
    } else {
      cb(null, data);
    }
  });
};

AlipayRecordParser.prototype.transform = function() {
  return entryTable.one2doubleEntries(this.fieldMapping, this.getAccountingItem);
};

var payItemMapping = [
  {
    item: '低值易耗品－衣物',
    patterns: [
      /裤/,
      /牛皮/,
      /鞋/,
      /袜/,
      /钱包/,
      /女装/,
      /枕头/,
      /男装/,
      /衣/
    ]
  },
  {
    item: '基本费用－娱乐支出',
    patterns: [
      /电影/
    ]
  },
  {
    item: '基本费用－通讯支出',
    patterns: [
      /VPN/
    ]
  },
  {
    item: '基本费用－健康支出',
    patterns: [
      /精油/,
      /美白/,
      /润肤/
    ]
  },
  {
    item: '基本费用－食物支出',
    patterns: [
      /糖/,
      /吉野家/,
      /巧克力/,
      /饼干/,
      /美团/,
      /红枣/,
      /零食/,
      /胶囊/,
      /餐厅/,
      /面/,
    ]
  },
];

var incomeItemMapping = [
  {
    item: '投资收益－利息',
    patterns: [
      /收益发放/
    ]
  }
];

var findItem = function(mapping) {
  return function(content) {
    var found = _(mapping).find(function(item2pattern) {
      return _(item2pattern.patterns).any(function(pattern, item) {
        return pattern.test(content);
      });
    });

    return found ? found.item : '';
  }
};

var getPayItem = findItem(payItemMapping);
var getIncomeItem = findItem(incomeItemMapping);

AlipayRecordParser.prototype.getAccountingItem = function(data, type) {
  if (data['收/支'] === '支出') {
    if (type === 'Cr') {
      return '银行存款－支付宝';
    } else {
      // 支出分类
      return getPayItem(data['商品名称']);
    }
  } else {
    if (type === 'Dr') {
      return '银行存款－支付宝';
    } else {
      return getIncomeItem(data['商品名称']);
    }
  }
};

module.exports = AlipayRecordParser;
