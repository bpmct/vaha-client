//This will allow me to record audio from the mic.
const record = require('node-record-lpcm16');

// Imports the Google Cloud Speech API to recognize user input
const Speech = require('@google-cloud/speech');

//Snowboy Hotword Listening (Listens for "Hey Scottie" before streaming)
const {Detector, Models} = require('snowboy');

//connection to sockets server (Connects to my little server that finds a response for everything)
var net = require('net');

// Instantiates a speech client
const speech = Speech();

// The encoding of the audio file, e.g. 'LINEAR16'
const encoding = 'LINEAR16';

// The sample rate of the audio file in hertz, e.g. 16000
const sampleRateHertz = 16000;

// The BCP-47 language code to use, e.g. 'en-US'
const languageCode = 'en-US';

//Creates a new client to pick up data from the TCP server I made.
var client = new net.Socket();

//Speaker is used to stream audio to the speaker (text-to-speech and audio files)
const Speaker = require('speaker');

//AWS is used to stream Text-to-Speech via Amazon Polly
const AWS = require('aws-sdk');
const Stream = require('stream');

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

//Creates the Speaker stream. Will stream audio to the speaker on the device.
var AudioStream = new Stream.Readable()

AudioStream._read = function () {}

//Sends audio to the Player.
AudioStream.pipe(Player)

//Conects to my TCP server (right now hosted on the same Pi)
client.connect(1337, '127.0.0.1', function() {

	console.log('Connected to server.\n');

	client.write('client: connected');

});

client.on('error', function(err) {

  //If cannot connect to the TCP server

  console.log("ERROR: Cannot connect to server\n");

	console.log(err.message + "\n");

	process.exit();

});

client.on('data', function(data) {

  //When data from the TCP server is recieved

  //Convers the data from server into readable text
	var serverResponse = data.toString('utf8');

	if (serverResponse == "other: ready") {

    //This will run when the server responds that it is ready to listen for user queries.

    startListening();

  } else if (serverResponse == "other: shutdown") {

    //This will shut down the scottie.

		console.log("Goodbye!\n");

		process.exit();

	 } else {

    //Will respond ANY other response from the TCP server with Amazon Polly text-to-speech.

    console.log("RESONSE: " + serverResponse + "\n");

    //Uses the speak() command to speak the response from the client.
		speak(serverResponse, "Kimberly");

    //Will listen again for the hotkey.
		startListening();

  }

});

function startListening() {

  //This will run when the device is ready to start waiting for the hot-word again.

  //Initializes the models() what snowboy will be listening to
	const models = new Models();

  //Adds my "Hey Scotty" hotword file.
	models.add({
	  file: 'resources/heyscottie.pmdl',
	  sensitivity: '0.5',
	  hotwords : 'Hey Scottie'
	});

  //Initializes the detector for the hotword.
	const detector = new Detector({
	  resource: "resources/common.res",
	  models: models,
	  audioGain: 2.0
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

	  console.log('Hotword Detected:', hotword, "\n");

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
  console.log("Listening for the word...\n");

}

// Start recording and send the microphone input to the Speech API
function startStreaming() {

  //Configures the request again with the same encoding, lanuage, etc.
	const request = {
	  config: {
	    encoding: encoding,
	    sampleRateHertz: sampleRateHertz,
	    maxAlternatives: 3,
	    languageCode: languageCode
	  },
	  interimResults: false // We don't want this because we want to know the whole query. Not as it is being said.
	};

	// Create a recognize stream. Will recognize what user says as he/she talks.
	var recognizeStream = speech.streamingRecognize(request)

	  .on('error', function(err) {

      //Will run if there's an error with Cloud Speech API.

      console.log("ERROR: Issue with Cloud Speech API.\n");

    	console.log(err.message + "\n");

    	process.exit();

		})

	  .on('data', function(data) {

        //This will run when it has data about what the user is saying.

        //Sends info to the TCP server, for it to figure out a witty response & return it.
	      client.write(data.results[0].alternatives[0].transcript);

        //Stops recording. It'll be Snowboy's job to take over again later.
	      record.stop();

	  });

    //Starts recording for Google Speech API.
	  record
	    .start({
	      sampleRateHertz: sampleRateHertz,
	      threshold: 0,
	      // Other options, see https://www.npmjs.com/package/node-record-lpcm16#options
	      verbose: false,
	      recordProgram: 'rec', // Try also "arecord" or "sox"
	      silence: '10.0'
	    })
      .on('error', function(err) {

        //Will run if there's an error with the mic

        console.log("ERROR: Issue with the mic streaming to Cloud Speech.\n");

        console.log(err.message + "\n");

        process.exit();

      })
	    .pipe(recognizeStream); //Will send the mic input to Cloud Speech API now.

}

//This is the function to speak the response that it got from the server.
let speak = function(text, VoiceId) {

  //Info about the speech
  let params = {
      'Text': text,
      'OutputFormat': 'pcm',
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
              AudioStream.push(data.AudioStream)

          }
      }
  })
}
