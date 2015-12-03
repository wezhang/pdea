var detect = require('charset-detector');
var eventStream = require('event-stream');

process.stdin
  .pipe(eventStream.map(function(data, cb) {
    var matches = detect(data);
    console.log(matches);
    cb();
  }));

