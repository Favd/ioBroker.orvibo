/**
 *
 * orvibo adapter
 *
 *
 *  file io-package.json comments:
 *
 *  {
 *      "common": {
 *          "name":         "orvibo",                  // name has to be set and has to be equal to adapters folder name and main file name excluding extension
 *          "version":      "0.0.0",                    // use "Semantic Versioning"! see http://semver.org/
 *          "title":        "Node.js orvibo Adapter",  // Adapter title shown in User Interfaces
 *          "authors":  [                               // Array of authord
 *              "name <mail@orvibo.com>"
 *          ]
 *          "desc":         "orvibo adapter",          // Adapter description shown in User Interfaces. Can be a language object {de:"...",ru:"..."} or a string
 *          "platform":     "Javascript/Node.js",       // possible values "javascript", "javascript/Node.js" - more coming
 *          "mode":         "daemon",                   // possible values "daemon", "schedule", "subscribe"
 *          "schedule":     "0 0 * * *"                 // cron-style schedule. Only needed if mode=schedule
 *          "loglevel":     "info"                      // Adapters Log Level
 *      },
 *      "native": {                                     // the native object is available via adapter.config in your adapters code - use it for configuration
 *          "test1": true,
 *          "test2": 42
 *      }
 *  }
 *
 */

/* jshint -W097 */// jshint strict:false
/*jslint node: true */
"use strict";

// you have to require the utils module and call adapter function
var tools  = require(__dirname + '/lib/tools');
var utils  = require(__dirname + '/lib/utils'); // Get common adapter utils
var dgram  = require('dgram');

var socket   = dgram.createSocket('udp4');
var hostname = tools.getHostName();

// you have to call the adapter function and pass a options object
// name has to be set and has to be equal to adapters folder name and main file name excluding extension
// adapter will be restarted automatically every time as the configuration changed, e.g system.adapter.orvibo.0
var adapter = utils.adapter('template');

// is called when adapter shuts down - callback has to be called under any circumstances!
adapter.on('unload', function (callback) {
    try {
        adapter.log.info('cleaned everything up...');
        callback();
    } catch (e) {
        callback();
    }
});

// is called if a subscribed object changes
adapter.on('objectChange', function (id, obj) {
    // Warning, obj can be null if it was deleted
    adapter.log.info('objectChange ' + id + ' ' + JSON.stringify(obj));
});

// is called if a subscribed state changes
adapter.on('stateChange', function (id, state) {
    // Warning, state can be null if it was deleted
    adapter.log.info('stateChange ' + id + ' ' + JSON.stringify(state));

    // you can use the ack flag to detect if it is status (true) or command (false)
    if (state && !state.ack) {
        adapter.log.info('ack is not set!');
    }
});

// Some message was sent to adapter instance over message box. Used by email, pushover, text2speech, ...
adapter.on('message', function (obj) {
    if (typeof obj == 'object' && obj.message) {
        if (obj.command == 'send') {
            // e.g. send email or pushover or whatever
            console.log('send command');

            // Send response in callback if required
            if (obj.callback) adapter.sendTo(obj.from, obj.command, 'Message received', obj.callback);
        }
    }
});

adapter.createDevice('devices', {
        common: {
            name: 'devices',
        },
        native: {}
    });
adapter.setObject('sendSeach', {
	type: 'state',
    common: {
        name: 'sendSeach',
		type: 'boolean',
        role: 'state'
    },
    native: {}
});

var orviboNow = {};
adapter.getChannelsOf('devices', function (err, objects){
	for(var key in objects){
		adapter.getState(objects[key]._id, function (err, state){
			orviboNow[state.val] = state.val;
		});
	}
});

// is called when databases are connected and adapter received configuration.
// start here!
adapter.on('ready', function () {
    main();
});

function main() {
	adapter.log.info('Object orviboNow - ' + JSON.stringify(orviboNow));		
	// Сервер и первичная обработка полученных сообщений
	socket.bind(10000, tools.findIPs()[1]);
	socket.on('message',function(msg,info){
			adapter.log.info('Data received: ' + msg.toString('hex'));
			adapter.log.info('Received ' + msg.length + ' bytes from ' + info.address + ' :' +info.port);
			
			// if from us - return
			if (info.address == tools.findIPs()[1]) return;
			
 			//Обработка ответа о поиске. Создание обекта с данными IP и MAC
			if (msg.toString('hex').substr(8,4) == '7161'){
				var mac = msg.toString('hex').substr(14,12);
				for(var key in orviboNow){
					adapter.log.info('********* !!! ********** ' + orviboNow[key] + '==' + mac);
					if (orviboNow[key] == mac) return;
				}
				// MAC & IP put in args
				var args = {
					mac: msg.toString('hex').substr(14,12),
					ip: info.address,
					model: msg.toString('hex').substr(62,6)
				}
				adapter.log.info('**** model **** -  ' + args.model);
				//model => create device
				if(args.model == '534f43'){
					createOrviboObjectS20(args);
					adapter.log.info('SEND TO CREATE S20: mac =  ' + args.mac + ', ip =  ' + args.ip + ', model =  ' + args.model);
				} else if(args.model == '495244'){
					createOrviboObjectAlone(args);
					adapter.log.info('SEND TO CREATE Allone: mac =  ' + args.mac + ', ip =  ' + args.ip + ', model =  ' + args.model);
				} else adapter.log.info('NEW MODEl DEVISES???: mac =  ' + args.mac + ', ip =  ' + args.ip + ', model =  ' + args.model);
			}
			
	});
	
	// Обработка внутрених сообщений (Изменение какого либо STATE)
	adapter.on('stateChange', function (id, state) {
		adapter.log.info('stateChange ' + id + ' ' + JSON.stringify(state));
		if (id == 'template.0.sendSeach' && state.val == 1){
			sendSeach();
		}else if (id == 'template.0.sendSeach' && state.val == 0){
			
		}
		this.emit('myLog',state);
		
		// you can use the ack flag to detect if state is command(false) or status(true)
		if (!state.ack) {
			adapter.log.info('ack is not set!');
		}
	});
	
	// Обработка внутрених сообщений **** ОБРАЗЕЦ ****
	adapter.on('myLog', function (xxx) {
		//adapter.log.info('Parsel from EMIT dan: ' + xxx);
	});    

    

    // Подписка адаптера на все изменения STATE
    adapter.subscribeStates('*');

    // examples for the checkPassword/checkGroup functions
    adapter.checkPassword('admin', 'iobroker', function (res) {
        console.log('check user admin pw ioboker: ' + res);
    });

    adapter.checkGroup('admin', 'admin', function (res) {
        console.log('check group user admin group admin: ' + res);
    });
	
	//************** TEMP **********************
	//var args = {name: 's20', mac: '00ffee8899dd'};
	//createOrviboObject(args);
	//sendSubscribe();
	
	//adapter.log.info('host.' + hostname + ' ip addresses: ' + tools.findIPs()[1] );
	//************** TEMP **********************
}	

function _connection(state){
    if (state){
        connection = true;
        adapter.log.info("ready!");
        adapter.setState('info.connection', true, true);
    } else {
        connection = false;
        adapter.setState('info.connection', false, true);
    }
}

//Создание устройства РОЗЕТКА
function createOrviboObjectS20(args){
	adapter.createChannel('devices', args.mac, {
		name: 'S20 - ' + args.mac,
		common: {
            name: args.mac,
        },
        native: {}
    });
	adapter.createState('devices', args.mac, 'onOff', {
		role: 'state',
		name: 'S20: On - Off',
		common: {
            name: 'S20 - onOff',
			type: 'boolean',
            role: 'state'
        },
        native: {}
    });
	adapter.setState('devices.' + args.mac + '.onOff', 0);
	adapter.setState('devices.' + args.mac, args.mac);
	orviboNow[args.mac] = args.mac;
	
}


// Создание устройства ALONE
function createOrviboObjectAlone(args){
	adapter.createChannel('devices', args.mac, {
		name: 'Allone - ' + args.mac,
		common: {
            name: args.mac,
        },
        native: {}
    });
	adapter.createState('devices', args.mac, 'learnIR', {
		role: 'state',
		name: 'Allone: learnIR',
		common: {
            name: 'Allone: learnIR',
			type: 'boolean',
            role: 'state'
        },
        native: {}
    });
	adapter.setState('devices.' + args.mac, args.mac);
	adapter.setState('devices.' + args.mac + '.learnIR', 0);
	orviboNow[args.mac] = args.mac;	
}

function sendSeach(){
	var msg = '686400067161';
	msg = Buffer.from(msg,'hex');
	socket.send(msg, 10000, '192.168.0.255', function(err){
		if(err){
			adapter.log.error('error: ' + err);
		}
		adapter.log.info('send message: ' + msg);
		});
	adapter.log.info('seach send');
	//this.emit('subscribe - ', args.mac);
}

