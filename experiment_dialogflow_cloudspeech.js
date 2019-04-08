//This will allow me to record audio from the mic.
const record = require('node-record-lpcm16');

// Imports the Google Cloud Speech API to recognize user input
const Speech = require('@google-cloud/speech');

//Snowboy Hotword Listening (Listens for "Hey Scottie" before streaming)
const {Detector, Models} = require('snowboy');

// Instantiates a speech client
const speech = Speech();

// The encoding of the audio file, e.g. 'LINEAR16'
const encoding = 'LINEAR16';

// The sample rate of the audio file in hertz, e.g. 16000
const sampleRateHertz = 16000;

// The BCP-47 language code to use, e.g. 'en-US'
const languageCode = 'en-US';

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

//DialogFlow Stuff
const projectId = 'helixvaha';
const sessionId = 'experiment-session'

// Creates a DialogFlow client.
const dialogflow = require('dialogflow');
const sessionClient = new dialogflow.SessionsClient();
const sessionPath = sessionClient.sessionPath(projectId, sessionId);


//Creates the Speaker stream. Will stream audio to the speaker on the device.
var AudioStream = new Stream.Readable()

AudioStream._read = function () {}

//Sends audio to the Player.
AudioStream.pipe(Player);

//IMPORTANT: This starts it all off. The endless loop of listening, analyzing, and saying it all back.
startListening();

//Function that will interpret the user query via DialogFlow
function dialogSmarts(query) {

  //Makes the request var
  var request = {
    session: sessionPath,
    queryInput: {
      text: {
        text: query,
        languageCode: languageCode,
      },
    },
  };

  sessionClient
    .detectIntent(request)
    .then(responses => {
      var result = responses[0].queryResult;
      console.log(`Query: ${result.queryText}`);
      console.log(`Response: ${result.fulfillmentText}`);

      //Says the response with Amazon Polly
      speak(result.fulfillmentText, "Kimberly");

      if (result.intent) {
        console.log(`Intent: ${result.intent.displayName}`);
      } else {
        console.log(`No intent matched.`);
      }

      console.log("--------------------------------");

      //Let's listen again for the user's next input
      startListening();

    })
    .catch(err => {

      console.error('ERROR: DialogFlow had an issue:', err);

      process.exit();

    });

}

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

    console.log('--------------------------------');
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
  console.log("\nListening for the word...\n");

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

        //Makes the data into something we understand
        var userQuery = data.results[0].alternatives[0].transcript;

        //Use the dialogSmarts to interpret & speak back.
        dialogSmarts(userQuery);

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
