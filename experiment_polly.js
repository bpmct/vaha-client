var AWS = require('aws-sdk');
var Speaker = require('speaker');
var Stream = require('stream');

var Polly = new AWS.Polly({
    signatureVersion: 'v4',
    region: 'us-west-2'
})

var getPlayer = function() {
    return new Speaker({
        channels: 1,
        bitDepth: 16,
        sampleRate: 16000
    });
}

var params = { OutputFormat: 'pcm', VoiceId: 'Raveena' }
var speak = function(text) {
    params.Text = text;
    Polly.synthesizeSpeech(params, function(err, res) {
        if (err) {
            console.log('err', err)
        } else if (res && res.AudioStream instanceof Buffer) {
            var bufferStream = new Stream.PassThrough()
            bufferStream.end(res.AudioStream)
            bufferStream.pipe(getPlayer());
        }
    })
}
module.exports = { Speak: speak };
