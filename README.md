# vaha-client
Voice-activated assistant using Raspberry Pi + DialogFlow + Amazon Polly

## Setup:
1. Add your AWS credentials to `~/.aws/credentials` (for using Amazon Polly)
2. Add your Google Service Account JSON file to `~/.google/service_account.json` (for DialogFlow + Cloud Speech API)
3. Start client with `node app.js` or `npm start`

## What about `vaha-server`?
The voice client I built was created for my high school, its main purpose being to serve information about the school. Because of that, I will be keeping the code private as some information may be sensitive, the code is proprietary to ceretain systems, and it wouldn't be particularily useful. I used a Firebase function for DialogFlow fulfillment and [you can read about that here.](https://dialogflow.com/docs/fulfillment/configure#create_a_webhook_with_the_inline_editor) You do not need to use the inline editor. I cloned my firebase project to my development environment and worked on it from there.

Later I will be releasing a repository with demos of the things you can do inside a firebase function for DialogFlow, such as API requests, RTDB lookups, etc. Hint: use promises!
