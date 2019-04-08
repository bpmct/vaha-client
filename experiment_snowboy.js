const record = require('node-record-lpcm16');
const {Detector, Models} = require('snowboy');

const models = new Models();

models.add({
  file: 'resources/heyscottie.pmdl',
  sensitivity: '0.5',
  hotwords : 'Hey Scottie'
});

const detector = new Detector({
  resource: "resources/common.res",
  models: models,
  audioGain: 2.0
});

detector.on('error', function () {
  console.log('error');
});

detector.on('hotword', function (index, hotword, buffer) {
  // <buffer> contains the last chunk of the audio that triggers the "hotword"
  // event. It could be written to a wav stream. You will have to use it
  // together with the <buffer> in the "sound" event if you want to get audio
  // data after the hotword.


  //console.log(buffer);

  //console.log('Hotword Detected: ', index, hotword);

  console.log('Hotword Detected: ', hotword);

});

const mic = record.start({
  threshold: 0,
  verbose: false
});

mic.pipe(detector);
