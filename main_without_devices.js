/**
 *
 * template adapter
 *
 *
 *  file io-package.json comments:
 *
 *  {
 *      "common": {
 *          "name":         "template",                  // name has to be set and has to be equal to adapters folder name and main file name excluding extension
 *          "version":      "0.0.0",                    // use "Semantic Versioning"! see http://semver.org/
 *          "title":        "Node.js template Adapter",  // Adapter title shown in User Interfaces
 *          "authors":  [                               // Array of authord
 *              "name <mail@template.com>"
 *          ]
 *          "desc":         "template adapter",          // Adapter description shown in User Interfaces. Can be a language object {de:"...",ru:"..."} or a string
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

var utils =    require(__dirname + '/lib/utils'); // Get common adapter utils
var tools  = require(__dirname + '/lib/tools');
var dgram = require('dgram');
var adapter = utils.adapter('template');
var socket = dgram.createSocket('udp4');
socket.bind(10000, tools.findIPs()[1]);

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

var orviboNow = {};
adapter.getForeignObjects (adapter.namespace + '.*', 'state', function (err, objs) { 
	for(var key in objs){
		if(objs[key].mac){
				orviboNow[objs[key].mac] = objs[key].macreverse;
		}
	} 
});

// is called when databases are connected and adapter received configuration.
// start here!
adapter.on('ready', function () {
    main();
});

function main() {
			
	//Константы
	var constOptions = {
		port: 10000,
		broadcastIP: "255.255.255.255",
		macPadding: "202020202020",
		magicWord: "6864",
		onoffID: '6463',
		on: '0000000001',
		off: '0000000000',
		seachID: '7161',
		subscribeID: '636c',
		learnID: '6c73',
		learn: '010000000000',
		sendIRID: '6963',
		sendIR: ''
	}
	
	// Сервер входящих + обработка событий
	socket.on('message',function(msg,info){
		// if from us - return
		if (info.address == tools.findIPs()[1]) return;
		
		//adapter.log.info('IP servera: ' + tools.findIPs()[1]);
		adapter.log.info('Data received: ' + msg.toString('hex'));
		adapter.log.info('Received ' + msg.length + ' bytes from ' + info.address + ' :' +info.port);
				
		//Обработка ответа о поиске. Создание обекта с данными IP и MAC
		if (msg.toString('hex').substr(8,4) == '7161'){
			var mac = msg.toString('hex').substr(14,12);
			for(var key in orviboNow){
				if (key == mac) return;
			}
			var obj = messageToObject(msg, info);
			createOrvibo(obj)
		}
		
		//Обработка ответа о подписке. Изменение состояния Онлайн и состояния сокета
		if (msg.toString('hex').substr(8,4) == '636c'){
			
		}
	});
		
	// Функция конструктор объекта
	function createOrvibo(obj){
		adapter.setObject(obj.mac, obj);
		adapter.log.info('object bild - ' + obj.mac);
		orviboNow[obj.mac] = obj.macReverse;
	}
	
	// Поиск устройств
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
	
	// вытаскивание ip и mac из сообщения
	function messageToObject(msg, info){
		msg = msg.toString('hex');
		var mac = msg.substr(14,12);
		var model = msg.substr(62,6);
		if(model == '534f43'){
			model = 'soketS20';
		}else if(model == '495244'){
			model = 'Allone';
		}
		var mcr = mac.split('');
		mcr = mcr[10] + mcr[11] + mcr[8] + mcr[9] + mcr[6] + mcr[7] + mcr[4] + mcr[5] + mcr[2] + mcr[3] + mcr[0] + mcr[1];
		var obj = {
			type: 'state',
			common: {
            name: model,
            type: 'boolean',
            role: 'state'
			},
			native: {},
			ip: info.address,
			mac: msg.substr(14,12),
			macreverse: mcr,
			model: model
		}
	return obj;
	}
	
	// Подписка на каждое зарегестрированое устройство (каждые 2 мин)
	function subscribeDevices(){
	// создаем пакет, узнаем длинну, дописываем 00, создаем финальный пакет с фактичекой длинной
		for(var key in orviboNow){
			var paket = constOptions.magicWord + '0000' + constOptions.subscribeID + key + constOptions.macPadding + orviboNow[key] + constOptions.macPadding;
			var length_  = prepareLength(paket);
			paket = constOptions.magicWord + length_ + constOptions.subscribeID + key + constOptions.macPadding + orviboNow[key] + constOptions.macPadding;
			sendMessage(paket);
		}
	}
	
	//Send Message
	function sendMessage(paket){
		var msg = Buffer.from(paket,'hex');
		socket.send(msg, 10000, '192.168.0.255', function(err){
			if(err){
				console.log('error: ' + err);
			}adapter.log.info('send message: ' + paket);
		});
	}
	
	function prepareLength(paket){
		if((paket.length/2).toString(16).length == 1){
			var length_ = '000' + (paket.length/2).toString(16);
		}else if((paket.length/2).toString(16).length == 2){
			length_ = length_ = '00' + (paket.length/2).toString(16);
		}else if((paket.length/2).toString(16).length == 3){
			length_ = length_ = '0' + (paket.length/2).toString(16);
		}
		return length_;
	}
	
	
		
	
	//************ !!! -- TEMP -- !!! *****************
	//sendSeach();
	//subscribeDevices();
	
	
	//************ !!! -- TEMP -- !!! *****************
	
	
	adapter.getForeignObjects (adapter.namespace + '.*', function (err, objs) {
		//adapter.log.info (JSON.stringify (objs)); 
		for(var key in objs){
			//adapter.log.info (objs[key].ip);
		}
	});
	
    var myObjTemp = {
		type: 'channel',
        common: {
            name: 'testVariable',
            
        },
        native: {},
    };
	

    adapter.setObject('testVariable', myObjTemp);
	
	adapter.createState(adapter.namespace,'testVariable', 'onOff', {
		role: 'state',
		name: 'S20: On - Off',
		common: {
            name: 'S20 - onOff',
			type: 'boolean',
            role: 'state'
        },
        native: {}
    });
	
	
	adapter.getObject('testVariable', function(err, obj){
		obj.ip = 'Viva Cuba!';
		adapter.setObject ('testVariable', obj);
	});
	setTimeout(function(){
		adapter.log.info('!!!!! - ' + JSON.stringify(orviboNow));
	    adapter.getObject('testVariable', function(err, state){
		
	});
	}, 5000);

    // in this template all states changes inside the adapters namespace are subscribed
    adapter.subscribeStates('*');


    /**
     *   setState examples
     *
     *   you will notice that each setState will cause the stateChange event to fire (because of above subscribeStates cmd)
     *
     */

    // same thing, but the value is flagged "ack"
    // ack should be always set to true if the value is received from or acknowledged from the target system
    //adapter.setState('testVariable', {val: true, ack: true});

    // same thing, but the state is deleted after 30s (getState will return null afterwards)
    //adapter.setState('testVariable', {val: true, ack: true, expire: 30});



    // examples for the checkPassword/checkGroup functions
    adapter.checkPassword('admin', 'iobroker', function (res) {
        console.log('check user admin pw ioboker: ' + res);
    });

    adapter.checkGroup('admin', 'admin', function (res) {
        console.log('check group user admin group admin: ' + res);
    });



}
