const projectId = 'helixvaha';
const sessionId = 'experiment-session'

const languageCode = 'en-US';

const pump = require('pump');
const through2 = require('through2')

const record = require('node-record-lpcm16');

// Instantiate a DialogFlow client.
const dialogflow = require('dialogflow');
const sessionClient = new dialogflow.SessionsClient();

// The encoding of the audio file, e.g. 'AUDIO_ENCODING_LINEAR16'
const encoding = 'AUDIO_ENCODING_LINEAR16';

// The sample rate of the audio file in hertz, e.g. 16000
const sampleRateHertz = 16000;

// The BCP-47 language code to use, e.g. 'en-US'

let sessionPath = sessionClient.sessionPath(projectId, sessionId);

const initialStreamRequest = {
  session: sessionPath,
  queryParams: {
    session: sessionClient.sessionPath(projectId, sessionId),
  },
  queryInput: {
    audioConfig: {
      audioEncoding: encoding,
      maxAlternatives: 4,
      sampleRateHertz: sampleRateHertz,
      languageCode: languageCode,
    },
    singleUtterance: true,
  },
};

// Create a stream for the streaming request.
const detectStream = sessionClient
  .streamingDetectIntent()
  .on('error', console.error)
  .on('data', data => {
    if (data.recognitionResult) {

      console.log(data);

      if(data.recognitionResult.isFinal) {

        record.stop();

      }

    } else {

      logQueryResult(sessionClient, data.queryResult);

    }
  });

// Write the initial stream request to config for audio input.
detectStream.write(initialStreamRequest);

const recordingAudio = record
  .start({
    sampleRateHertz: sampleRateHertz,
    threshold: 0,
    // Other options, see https://www.npmjs.com/package/node-record-lpcm16#options
    verbose: false,
    recordProgram: 'rec', // Try also "arecord" or "sox"
    silence: '10.0'
  }).on('error', console.error);

//Streams the microphone to it
pump(
  recordingAudio,
  // Format the audio stream into the request format.
  through2.obj((obj, _, next) => {
    next(null, {inputAudio: obj});
  }),
  detectStream
);

function logQueryResult(sessionClient, result) {
  // Imports the Dialogflow library
  const dialogflow = require('dialogflow');

  // Instantiates a context client
  const contextClient = new dialogflow.ContextsClient();

  if (result) {

    console.log(result.Alternatives);

    console.log(`  Query: ${result.queryText}`);
    console.log(`  Response: ${result.fulfillmentText}`);
    if (result.intent) {
      console.log(`  Intent: ${result.intent.displayName}`);
    } else {
      console.log(`  No intent matched.`);
    }

  }

}

