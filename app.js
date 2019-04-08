//ENVIRONMENT VARIABLE. You need to generate your own and upload this here
process.env['GOOGLE_APPLICATION_CREDENTIALS'] = '/home/pi/.google/service_account.json';

//DialogFlow Details (We'll use this later)
const projectId = 'helixvaha';
const sessionId = 'vaha-session'

//Upload your AWS credentials in ~/.aws/credentials

//This will allow me to record audio from the mic.
const record = require('node-record-lpcm16');

//Snowboy Hotword Listening (Listens for "Hey Scottie" before streaming)
const {Detector, Models} = require('snowboy');

//Let's add the DialogFlow API
const dialogflow = require('dialogflow');

//AWS is used to stream Text-to-Speech via Amazon Polly
const AWS = require('aws-sdk');

//Speaker is used to stream audio to play stuff :)
const Speaker = require('speaker');

//Some tools used to stream to the speaker and the APIs.
const Stream = require('stream');
const pump = require('pump');
const through2 = require('through2');

var ip = require("ip");

//Uses file system for playing sounds
const fs = require('fs');

//Lame is used to decode mp3s
var lame = require('lame');

//Stuff we need for the LEDs
var rpio = require('rpio');
var Promise = require('bluebird');
var spi = require('spi');

class LedProvider {

  constructor() {

      this.led_length = 12;
      this.led_buffer;
      this.device;
      this.led_bits = this.led_length * 4 + 8;

  }

  init(callback) {
      return new Promise((resolve, reject) => {
          Promise.resolve()
              .then(() => {
                  rpio.init({ mapping: 'gpio', gpiomem: true })
                  rpio.open(5, rpio.OUTPUT, rpio.HIGH);
                  return;
              })
              .delay(100)
              .then(() => {
                  this.device = new spi.Spi('/dev/spidev0.0', {
                      'mode': spi.MODE['MODE_0']
                  })
                  this.device.maxSpeed(4000000);
                  this.device.open();

                  this.led_buffer = new Buffer(this.led_bits);
                  for (let i = 0; i < this.led_bits; i++) {
                      if (i < (this.led_bits - 4))
                          this.led_buffer[i] = 0x00;
                      else
                          this.led_buffer[i] = 255;
                  }
            callback();
                  resolve();
              })
      })

  }

  writeStrip() {
      return Promise.try(() => {
          this.device.write(this.led_buffer);
      });
  }

  clear() {
      return this.fillPix(0, 0, 0, 255);
  }

  setPix(position, red, green, blue, brightness) {

      return new Promise((resolve, reject) => {
          if (position > this.led_length) {
              reject(new Error('Wrong Position'));
          }
          else {
              let current_led = 4 + (position * 4)
              this.led_buffer[current_led + 1] = blue;
              this.led_buffer[current_led + 2] = green;
              this.led_buffer[current_led + 3] = red;
              this.led_buffer[current_led + 0] = brightness;
              resolve(this.writeStrip());
          }
      });
  }

  fillPix(red, green, blue, brightness) {
      for (let i = 0; i < this.led_length; i++) {
          var current_led = 4 + (i * 4);
          this.led_buffer[current_led + 1] = blue;
          this.led_buffer[current_led + 2] = green;
          this.led_buffer[current_led + 3] = red;
          this.led_buffer[current_led + 0] = brightness;
      }
      return this.writeStrip();
  }

  fillPulseUp(red, green, blue, brightnessStart, brightnessMax) {

      if (!brightnessStart)
          brightnessStart = 160;
      if (!brightnessMax)
          brightnessMax = 185;

      for (let i = 0; i < this.led_length; i++) {
          var current_led = 4 + (i * 4);
          this.led_buffer[current_led + 1] = blue;
          this.led_buffer[current_led + 2] = green;
          this.led_buffer[current_led + 3] = red;
          this.led_buffer[current_led + 0] = brightnessStart;
      }

      this.writeStrip();


      if (brightnessStart < brightnessMax) {

          brightnessStart++;

          // .this workaround
          var that = this;
          setTimeout(function() {

              that.fillPulseUp(red, green, blue, brightnessStart, brightnessMax)
          
          }, 30);


      } else {

          return 1;

      }

  }

  fillPulseDown(red, green, blue, brightnessStart, brightnessMin) {

      if (!brightnessStart)
          brightnessStart = 185;
      if (!brightnessMin)
          brightnessMin = 160;

      for (let i = 0; i < this.led_length; i++) {
          var current_led = 4 + (i * 4);
          this.led_buffer[current_led + 1] = blue;
          this.led_buffer[current_led + 2] = green;
          this.led_buffer[current_led + 3] = red;
          this.led_buffer[current_led + 0] = brightnessStart;
      }

      this.writeStrip();


      if (brightnessStart > brightnessMin) {

          brightnessStart--;

          // .this workaround
          var that = this;
          setTimeout(function() {

              that.fillPulseDown(red, green, blue, brightnessStart, brightnessMin)
          
          }, 30);


      } else {

          return 1;

      }

  }

}
let respeaker = new LedProvider();

//Some settings for the mic & speaker.
const encoding = 'LINEAR16';
const sampleRateHertz = 16000;
const languageCode = 'en-US';

// Create an Polly client
const Polly = new AWS.Polly({
    signatureVersion: 'v4',
    region: 'us-west-2'
})

// Create the Speaker instance
let Player = new Speaker({
  channels: 1,
  bitDepth: 16,
  sampleRate: 16000
})

// Creates a DialogFlow client.
const sessionClient = new dialogflow.SessionsClient();
const sessionPath = sessionClient.sessionPath(projectId, sessionId);

//Creates the Speaker stream. Will stream audio to the speaker on the device.
var AudioStream = new Stream.Readable()
AudioStream._read = function () {}

//Sends audio to the Player.
AudioStream.pipe(Player);

//IMPORTANT: This starts it all off. The endless loop of listening, analyzing, and saying it all back.
startListening();

function startListening(notFirstTime) {

  if (notFirstTime == true) {

    setTimeout(function() {

      respeaker.fillPulseDown(0, 0, 255);
  
    }, 1000);  }


  //This will run when the device is ready to start waiting for the hot-word again.

  //Initializes the models() what snowboy will be listening to
	const models = new Models();

  //Adds my "Hey Scotty" hotword file.
	models.add({
	  file: '/home/pi/vaha/resources/chromebookscottie.pmdl',
	  sensitivity: '0.5',
	  hotwords : 'Hey Scottie'
	});

  //Initializes the detector for the hotword.
	const detector = new Detector({
	  resource: "/home/pi/vaha/resources/common.res",
	  models: models,
	  audioGain: 1.0
	});

	detector.on('error', function (err) {

    //This will run when there is somehow an error with Snowboy

    console.log("ERROR: Cannot initialize snowboy hotword detector\n");

  	console.log(err.message + "\n");

  	process.exit();

	});

	detector.on('hotword', function (index, hotword, buffer) {

    //This will run when the hotword is detected from the mic, obviously...

	  // <buffer> contains the last chunk of the audio that triggers the "hotword"
	  // event. It could be written to a wav stream. You will have to use it
	  // together with the <buffer> in the "sound" event if you want to get audio
	  // data after the hotword.


	  //console.log(buffer);

	  //console.log('Hotword Detected: ', index, hotword);

    console.log('--------------------------------');
	  console.log('Hotword Detected:', hotword, "\n");

    // playSound("ScottyChime.mp3");

    //Stop recording & listening for a hotword. This is important because it will open again when listening on Cloud Speech.
    record.stop();

    //Runs startStreaming() which will now stream the MIC INPUT to Cloud Speech API to figure out what the user is saying.
	  startStreaming();

	});

  //Starts listening with the microphone
  var mic = record.start({
    threshold: 0,
    verbose: false
  });

	mic.on('error', function(err) {

    //Will run if cannot connect to mic & stream.

    console.log("ERROR: Cannot start recording mic.\n");

  	console.log(err.message + "\n");

  	process.exit();

	});

  //Streams the mic input to the snowboy detector
  mic.pipe(detector);

  //Notes that it's ready for the hotword.
  console.log("\nListening for the word...\n");

}

// Start recording and send the microphone input to the Speech API
function startStreaming() {

  var unanswered = true;

  //The info needed to start streaming to DialogFlow API :)
  var initialStreamRequest = {
    session: sessionPath,
    queryParams: {
      session: sessionClient.sessionPath(projectId, sessionId),
    },
    queryInput: {
      audioConfig: {
        audioEncoding: encoding,
        sampleRateHertz: sampleRateHertz,
        languageCode: languageCode,
        model: "command_and_search",
      },
      singleUtterance: true,
    }
  }

  setTimeout(function() {

    if (unanswered == true)
    	record.stop();

  }, 5000);

	// Create a recognize stream. Will recognize what user says as he/she talks.
  var detectStream = sessionClient
    .streamingDetectIntent()
    .on('error', console.error)
    .on('data', data => {

      if (data.recognitionResult) {

	unanswered = false;

        //This will run every time that it recognizes a new word in the stream, etc.

        if(data.recognitionResult.isFinal) {

          //This will run when it detects a pause in a query. ex. end of a sentence

          //Stops recording the input, which tells DialogFlow it's time to figure out how to respond
          record.stop();

        }

      } else {

        //This runs when it's time to respond.

        letsRespond(sessionClient, data.queryResult);


      }
    });

    //Writes the initial request to let DialogFlow it's ready to start listening
    detectStream.write(initialStreamRequest);

    respeaker.fillPulseUp(0, 255, 0);


    //Defines the variable to record audio from the mic to DialogFlow
    const recordingAudio = record
      .start({
        sampleRateHertz: sampleRateHertz,
        threshold: 0,
        // Other options, see https://www.npmjs.com/package/node-record-lpcm16#options
        verbose: false,
        recordProgram: 'rec', // Try also "arecord" or "sox"
        silence: '10.0',
      }).on('error', console.error);

    //Streams the microphone to DialogFlow API. pump() is used.
    pump (
      recordingAudio,
      // Format the audio stream into the request format.
      through2.obj((obj, _, next) => {
        next(null, {inputAudio: obj});
      }),
      detectStream
    );

}

function letsRespond(sessionClient, result) {

  respeaker.fillPix(0, 0, 255, 255);

  //Time to respond to the user's query :)

  // Instantiates a context client
  const contextClient = new dialogflow.ContextsClient();

  if (result) {

    console.log(`  Query: ${result.queryText}`);
    console.log(`  Response: ${result.fulfillmentText}`);
    if (result.intent) {
      console.log(`  Intent: ${result.intent.displayName}`);
    } else {
      console.log(`  No intent matched.`);
    }

    //Returns the response using Amazon Polly.
    speak(result.fulfillmentText, "Kimberly");

    console.log("\n--------------------------------");

    if (result.intent != null) {
	if  (result.intent.displayName == "IP Address") {

		speak("My IP Address is " + ip.address());

	}
	if  (result.intent.displayName == "Shutdown") {

      const { exec } = require('child_process');

      exec('shutdown -h now', (err, stdout, stderr) => {
        if (err) {
          return;
        }

        // the *entire* stdout and stderr (buffered)
        console.log(`stdout: ${stdout}`);
        console.log(`stderr: ${stderr}`);
      });

    }

  }

    //Let's listen again for the user's next input
    startListening(true);

  }

}

//This is the function to speak the response that it got from the server.
let speak = function(text, VoiceId) {

  //Info about the speech
  let params = {
      'Text': "<speak>" + text + "</speak>",
      'OutputFormat': 'pcm',
      'TextType': 'ssml',
      'VoiceId': (VoiceId || 'Kimberly')
  }

  Polly.synthesizeSpeech(params, (err, data) => {
      if (err) {

        //Will run if there's an error with Amazon Polly

        console.log("ERROR: Issue with Amazon Polly.\n");

        console.log(err.code + "\n");

        process.exit();

      } else if (data) {

          if (data.AudioStream instanceof Buffer) {

              //Pushes the Amazon Polly text-to-speech response to the speaker.
              AudioStream.push(data.AudioStream);

          }
      }

  })
}

//Creates a seperate audio stream to play unique mp3 files.
function playSound(file) {

  //Creates new stream
  var Readable = require('stream').Readable;

  //Reads the file defined
  var mp3Buffer = fs.readFileSync("/home/pi/vaha/resources/sounds/" + file);

  //Uses the buffer function and pipes to lame to decode, then pipes to the new Speaker.
  bufferToReadableStream(mp3Buffer)
      .pipe(new lame.Decoder)
      .pipe(new Speaker);

  //Pushes the sound to the screen.
  function bufferToReadableStream(buffer) {
      let stream = new Readable();
      stream.push(buffer);
      stream.push(null);
      return stream;
  }

}

//Let's turn on the LEDs to say hi
respeaker.init(function() {

  respeaker.clear();
      
  respeaker.fillPulseUp(255, 255, 255);

  setTimeout(function() {

    respeaker.fillPulseDown(255, 255, 255);

  }, 2000);


});

//Returns the response using Amazon Polly.
speak("I am all booted up.", "Kimberly");
