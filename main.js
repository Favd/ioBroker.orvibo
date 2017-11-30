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
    adapter.log.info('stateChange ' + id);

    // you can use the ack flag to detect if it is status (true) or command (false)
    if (state && !state.ack) {
        adapter.log.info('ack is not set!');
    }
});

// Some message was sent to adapter instance over message box. Used by email, pushover, text2speech, ...
adapter.on('message', function (obj) {
	adapter.log.info('---------!!!----' + obj);
    if (typeof obj == 'object' && obj.message) {
        if (obj.command == 'send') {
            // e.g. send email or pushover or whatever
            console.log('send command');

            // Send response in callback if required
            if (obj.callback) adapter.sendTo(obj.from, obj.command, 'Message received', obj.callback);
        }
    }
});

adapter.on('test', function (obj) {
	adapter.log.info('---------!!!----' + obj);
});


adapter.setObject('seachDevices', {
		type: 'state',
        common: {
            name: 'seachDevices',
            role: 'state',
			type: 'state'
        },
        native: {},
	});
	
adapter.createDevice('devices', {
        common: {
            name: 'devices',
        },
        native: {}
});

var orviboNow = {};
adapter.getChannelsOf ('devices', function (err, objs) { 
	for(var key in objs){
		if(objs[key].common.mac){
				orviboNow[objs[key].common.mac] = objs[key].common.macreverse;
		}
	} 
});

adapter.getObject(adapter.namespace+'.devices', function(err, obj){
	obj.orviboDevices = orviboNow;
	adapter.setObject(adapter.namespace+'.devices', obj);
});

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
	
// is called when databases are connected and adapter received configuration.
// start here!
adapter.on('ready', function () {
    main();
});

function main() {
	subscribeDevices()		
		
	// Таймер подписки устройств
	setInterval(function(){
		subscribeDevices()
	}, 120000);
	
	// Сервер входящих UDP + обработка событий
	socket.on('message',function(msg,info){
		// if from us - return
		if (info.address == tools.findIPs()[1]) return;
		
		//adapter.log.info('IP servera: ' + tools.findIPs()[1]);
		adapter.log.info('Data received: ' + msg.toString('hex'));
		adapter.log.info('Received ' + msg.length + ' bytes from ' + info.address + ' :' +info.port);
				
		//Обработка ответа о поиске. Создание обекта с данными IP и MAC
		if (msg.toString('hex').substr(8,4) == '7161'){
			adapter.log.info('temp - point 1 ' + msg.toString('hex'));
			var mac = msg.toString('hex').substr(14,12);
			for(var key in orviboNow){
				if (key == mac) return;
			}
			var obj = messageToObject(msg, info);
			createOrvibo(obj);
		}
		
		//Обработка ответа о подписке. Изменение состояния Онлайн и состояния сокета
		if (msg.toString('hex').substr(8,4) == '636c'){
			//var model = msg.toString('hex').substr(62,6);
			var mac = msg.toString('hex').substr(12,12);
			//var state = msg.toString('hex').substr(-1,1); 
			adapter. setState('devices.'+mac+'.Online', 1, true);
		}
		
		//Обработка ответа о ВКЛ ВЫКЛ сокета. Изменение состояния Онлайн и состояния сокета
		if (msg.toString('hex').substr(8,4) == '7366'){
			var mac = msg.toString('hex').substr(12,12);
			adapter. setState('devices.'+mac+'.onOff', msg.toString('hex').substr(-1,1), true);
		}
		
		//Обработка ответа Возврат IR кода при обучении. Сохдание State - команды
		if (msg.toString('hex').substr(8,4) == '6c73' && msg.toString('hex').length > 70){
			var mac = msg.toString('hex').substr(12,12);
			var IR = msg.toString('hex').substr(48);
			adapter.log.info('Получен msg - ' + msg.toString('hex'));
			adapter.log.info('Получен IR - ' + IR);
			//adapter. setState('devices.'+mac+'.ir', IR, true);
			adapter.createState('devices', mac, 'IR_'+IR.substr(30,5), {
				role: 'command',
				name: 'IR comand',
				write: true,
				IRcode: IR,
				native: {}
			});
		}
	});
	
	adapter.on('stateChange', function (id, state) {
		id = id.split('.');
		var ch = id[id.length - 2];
		var st = id[id.length - 1];
		if (st == 'onOff' && !state.ack) {
			adapter.getObject('devices.'+ch, function(err, obj){
				setStateS20(state, obj);
			});
		}
		if (st == 'seachDevices') {
			sendSeach();
		}
		if (st == 'learnIRcom') {
			adapter.getObject('devices.'+ch, function(err, obj){
				learnIR(obj);
			});
		}
	});

	// Функция создание объекта
	function createOrvibo(obj){
		
		adapter.createChannel('devices', obj.mac, obj);
		adapter.log.info('device - ' + obj.model);
		
		if(obj.model =='socketS20'){
			adapter.createState('devices', obj.mac, 'onOff', {
				role: 'command',
				name: 'S20: On - Off',
				write: true,
				type: 'boolean',
				common: {
					name: 'S20 - onOff',
					type: 'boolean',
					role: 'command'
				},
				native: {}
			});
		}
		if(obj.model =='Allone'){
			adapter.createState('devices', obj.mac, 'learnIRcom', {
				role: 'command',
				name: 'Allone: learnMode',
				write: true,
				type: 'boolean',
				common: {
					name: 'Allone: learnMode',
					type: 'boolean',
					role: 'command'
				},
				native: {}
			});
		}
		adapter.createState('devices', obj.mac, 'Online', {
			role: 'state',
			name: 'Online',
			type: 'boolean',
			write: true,
			common: {
				name: 'Online',
				type: 'boolean',
				role: 'state'
			},
			native: {}
		});
		adapter.log.info('object bild - ' + obj.mac);
		orviboNow[obj.mac] = obj.macreverse;
		adapter.getObject(adapter.namespace+'.devices', function(err, obj){
			obj.orviboDevices = orviboNow;
			adapter.setObject(adapter.namespace+'.devices', obj);
		});
	}
	
	// ИМЕНЕНИЕ СТАТУСА s20
	function setStateS20(state, obj){
		if(state.val == 1){
			var paket = constOptions.magicWord + '0000' + constOptions.onoffID + obj.common.mac + constOptions.macPadding + constOptions.on;
			var length_  = prepareLength(paket); 
			paket = constOptions.magicWord + length_ + constOptions.onoffID + obj.common.mac + constOptions.macPadding + constOptions.on;
			sendMessage(paket);		
		} else if(state.val == 0){
			var paket = constOptions.magicWord + '0000' + constOptions.onoffID + obj.common.mac + constOptions.macPadding + constOptions.off;
			var length_  = prepareLength(paket); 
			paket = constOptions.magicWord + length_ + constOptions.onoffID + obj.common.mac + constOptions.macPadding + constOptions.off;
			sendMessage(paket);		
		}
	}
	
	// Поиск устройств
	function sendSeach(){
	var msg = '686400067161';
	msg = Buffer.from(msg,'hex');
	socket.send(msg, 10000, '192.168.0.255', function(err){
		if(err){
			adapter.log.error('error: ' + err);
		}
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
			model = 'socketS20';
		}else if(model == '495244'){
			model = 'Allone';
		}
		var mcr = mac.split('');
		mcr = mcr[10] + mcr[11] + mcr[8] + mcr[9] + mcr[6] + mcr[7] + mcr[4] + mcr[5] + mcr[2] + mcr[3] + mcr[0] + mcr[1];
		var obj = {
			common: {
            name: model,
            role: 'state'
			},
			native: {},
			name: model,
			type: 'boolean',
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
		adapter.emit('subscribe - is done', paket);
	}
	
	// ОТПРАВКА IR КОДА
	function sendIR(codeIR, obj){
		var paket = constOptions.magicWord + '0000' + constOptions.sendIRID + this.mac + constOptions.macPadding + '65000000' + '1214' + codeIR;
		var length_  = prepareLength(paket); 
		paket = constOptions.magicWord + length_ + constOptions.sendIRID + this.mac + constOptions.macPadding + '65000000' + Math.round(Math.random()*10000) + codeIR;
		sendMessage(paket);
}
	
	//Send Message
	function sendMessage(paket){
		var msg = Buffer.from(paket,'hex');
		socket.send(msg, 10000, '192.168.0.255', function(err){
			if(err){
				console.log('error: ' + err);
			}adapter.log.info('I am send message: ' + paket);
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
	
	function learnIR(obj){
		var paket = constOptions.magicWord + '0000' + constOptions.learnID + obj.common.mac + constOptions.macPadding + constOptions.learn;
		var length_  = prepareLength(paket); 
		paket = constOptions.magicWord + length_ + constOptions.learnID + obj.common.mac + constOptions.macPadding + constOptions.learn;
		sendMessage(paket);
	}
		
	adapter.subscribeStates('*');
	
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
		type: 'state',
        common: {
            name: 'testVariable',
            role: 'state',
			type: 'state'
        },
        native: {},
    };
	

    adapter.setObject('testVariable', myObjTemp);
	
	adapter.getObject('testVariable', function(err, obj){
		obj.ip = 'Viva Cuba!';
		adapter.setObject ('testVariable', obj);
	});
	setTimeout(function(){
		adapter.log.info('!!!!! - ' + JSON.stringify(orviboNow));
	    adapter.getObject('testVariable', function(err, state){
		
	});
	}, 2000);

    // in this template all states changes inside the adapters namespace are subscribed
    

    adapter.checkPassword('admin', 'iobroker', function (res) {
        console.log('check user admin pw ioboker: ' + res);
    });

    adapter.checkGroup('admin', 'admin', function (res) {
        console.log('check group user admin group admin: ' + res);
    });



}
