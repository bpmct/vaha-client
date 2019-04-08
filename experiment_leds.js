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

respeaker.init(function() {

    respeaker.clear();
        
    respeaker.fillPulseUp(3, 150, 43);

});

setTimeout(function() {

    respeaker.fillPulseDown(255, 255, 255);

}, 5000);

