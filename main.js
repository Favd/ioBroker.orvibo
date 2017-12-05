/* jshint -W097 */// jshint strict:false
/*jslint node: true */
"use strict";

var utils =    require(__dirname + '/lib/utils'); // Get common adapter utils
var tools  = require(__dirname + '/lib/tools');
var dgram = require('dgram');
var adapter = utils.adapter('orvibo');
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

adapter.createDevice('devices', {
        common: {
            name: 'devices',
        },
        native: {}
});

// Constants
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
	};
	
// start here!
adapter.on('ready', function () {
    main();
});

function main() {
	
	var orviboNow = {};
	getOrviboNow();
	
	// Recording Registered Devices to a Device Object
	function getOrviboNow(){
		adapter.getChannelsOf ('devices', function (err, objs) { 
			for(var key in objs){
				if(objs[key].common.mac){
					orviboNow[objs[key].common.mac] = objs[key].common.macreverse;
				}
				if(objs[key].common.model == 'Allone'){
						getAlloneIR(objs[key]);
				}
			} 
		});
		setTimeout(function(){
			adapter.getObject(adapter.namespace+'.devices', function(err, obj){
				obj.orviboDevices = orviboNow;
				adapter.setObject(adapter.namespace+'.devices', obj);
			});
		}, 1000);
	}

	// Write existing IR commands to the corresponding device object
	function getAlloneIR(obj){
		adapter.getStatesOf ('devices', obj.common.mac, function (err, objs) {
			var IRcodeObject ={};
			for(var key in objs){		
				if(objs[key].common.name != 'Online'){
					IRcodeObject[objs[key]._id] = objs[key].common.name;
				}
			} 
			adapter.getObject(obj._id, function(err, chanel){
				chanel.native =IRcodeObject;
				adapter.setObject(obj._id, chanel);
			});
		});
	}
	

	// Receiving and processing commands from admin settings window
	adapter.on('message', function (obj) {
		adapter.log.info('---------- Adapter reseive Message: ' + JSON.stringify(obj));
		if(obj.command == 'seachDevices'){
			adapter.sendTo(obj.from, obj.command, 'Reseive "seachDevices". Return letter', obj.callback);
			sendSeach();
		}
		if(obj.command == 'learnIR'){
			adapter.sendTo(obj.from, obj.command, 'Reseive "learnIR". Return letter', obj.callback);
			adapter.getObject(adapter.namespace+'.devices.' + obj.message, function(err, object){				
				learnIR(object);
			});
		} 
	});
		
	// Subscription timer & first subscription
	setTimeout(function(){subscribeDevices()}, 3000);
	setInterval(function(){
		subscribeDevices();
	}, 120000);
	
	// Server incoming UDP + event handling
	socket.on('message',function(msg,info){
		// if from us - return
		if (info.address == tools.findIPs()[1]) return;
		var mac;
		//adapter.log.info('IP servera: ' + tools.findIPs()[1]);
		adapter.log.info('Data received: ' + msg.toString('hex'));
		adapter.log.info('Received ' + msg.length + ' bytes from ' + info.address + ' :' +info.port);
				
		// Handling the search response. Call "createOrvibo"
		if (msg.toString('hex').substr(8,4) == '7161'){
			adapter.log.info('temp - point 1 ' + msg.toString('hex'));
			mac = msg.toString('hex').substr(14,12);
			for(var key in orviboNow){
				if (key == mac) return;
			}
			var obj = messageToObject(msg, info);
			createOrvibo(obj);
		}
		
		// Handling a subscription response. Changing the Online Status and the Status of the Socket
		if (msg.toString('hex').substr(8,4) == '636c'){
			//var model = msg.toString('hex').substr(62,6);
			mac = msg.toString('hex').substr(12,12);
			//var state = msg.toString('hex').substr(-1,1); 
			adapter. setState('devices.'+mac+'.Online', 1, true);
		}
		
		// Handling the answer about ON OFF the socket.
		if (msg.toString('hex').substr(8,4) == '7366'){
			mac = msg.toString('hex').substr(12,12);
			adapter. setState('devices.'+mac+'.onOff', msg.toString('hex').substr(-1,1), true);
		}
		
		//Response processing - Return of IR code during training. Call "createIRcommand"
		if (msg.toString('hex').substr(8,4) == '6c73' && msg.toString('hex').length > 70){
			mac = msg.toString('hex').substr(12,12);
			var IR = msg.toString('hex').substr(48);
			adapter.log.info('Получен msg - ' + msg.toString('hex'));
			adapter.log.info('Получен IR - ' + IR);
			createIRcommand(mac, IR);
		}
	});
	
	// Processing State Changes
	adapter.on('stateChange', function (id, state) {
		var idArr = id.split('.');
		var ch = idArr[idArr.length - 2];
		var st = idArr[idArr.length - 1];
		if(state.val === 1 || state.val === true ) state.val = true;
		
		// On - Off socket S20
		if (st == 'onOff' && !state.ack) {
			adapter.getObject('devices.'+ch, function(err, obj){
				setStateS20(state, obj);
			});
		}
		
		// Change state IR  ->  Send IR
		if (st.substr(0,2) == 'IR' && state.val===true) {
			adapter.getObject(id, function(err, obj){
				sendIR(obj, ch);
				adapter.log.info('Change state: ' + ch + '.' + st + '  -  Send IR');
			});
		}
	});

	// Creating a device object
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
	
	
	// Creating an IR command for training
	function createIRcommand(mac, IR){
		adapter.getObject(adapter.namespace+'.devices.' + mac, function(err, obj){
			adapter.log.info('---- createIRcommand: ' + JSON.stringify(obj));
			adapter.createState('devices', mac, ('IR_' + Math.round(Math.random()*10000)), {
				role: 'command',
				name: 'IR comand',
				write: true,
				native: {
					IRcode: IR
				}
			});
			setTimeout(function(){
				getAlloneIR(obj);
			}, 1000);
		});
	}
	
	
	// On - Off S20
	function setStateS20(state, obj){
		var length_;
		var paket;
		if(state.val == 1){
			paket = constOptions.magicWord + '0000' + constOptions.onoffID + obj.common.mac + constOptions.macPadding + constOptions.on;
			length_  = prepareLength(paket); 
			paket = constOptions.magicWord + length_ + constOptions.onoffID + obj.common.mac + constOptions.macPadding + constOptions.on;
			sendMessage(paket);		
		} else if(state.val == 0){
			paket = constOptions.magicWord + '0000' + constOptions.onoffID + obj.common.mac + constOptions.macPadding + constOptions.off;
			length_  = prepareLength(paket); 
			paket = constOptions.magicWord + length_ + constOptions.onoffID + obj.common.mac + constOptions.macPadding + constOptions.off;
			sendMessage(paket);		
		}
	}
	
	// Device Search
	function sendSeach(){
		var msg = '686400067161';
		msg = Buffer.from(msg,'hex');
		socket.send(msg, 10000, '192.168.0.255', function(err){
			if(err){
				adapter.log.error('error: ' + err);
			}
		});
		adapter.log.info('seach send');
	}
	
	// Processing of UDP messages from the device
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
		};
	return obj;
	}
	
	// Subscription to each registered device
	function subscribeDevices(){
		for(var key in orviboNow){
			var paket = constOptions.magicWord + '0000' + constOptions.subscribeID + key + constOptions.macPadding + orviboNow[key] + constOptions.macPadding;
			var length_  = prepareLength(paket);
			paket = constOptions.magicWord + length_ + constOptions.subscribeID + key + constOptions.macPadding + orviboNow[key] + constOptions.macPadding;
			sendMessage(paket);
		}	
	}
	
	// Send IR code
	function sendIR(obj, ch){
		var codeIR = obj.native.IRcode;
		var paket = constOptions.magicWord + '0000' + constOptions.sendIRID + ch + constOptions.macPadding + '65000000' + '1214' + codeIR;
		var length_  = prepareLength(paket); 
		paket = constOptions.magicWord + length_ + constOptions.sendIRID + ch + constOptions.macPadding + '65000000' + Math.round(Math.random()*10000) + codeIR;
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
	
	//the length of the packet to be sent in the form of XXXX
	function prepareLength(paket){
		var length_;
		if((paket.length/2).toString(16).length == 1){
			length_ = '000' + (paket.length/2).toString(16);
		}else if((paket.length/2).toString(16).length == 2){
			length_ = '00' + (paket.length/2).toString(16);
		}else if((paket.length/2).toString(16).length == 3){
			length_ = '0' + (paket.length/2).toString(16);
		}else length_ = (paket.length/2).toString(16);
		return length_;
	}
	
	// SENDING A REQUEST FOR TRAINING IR
	function learnIR(obj){
		var paket = constOptions.magicWord + '0000' + constOptions.learnID + obj.common.mac + constOptions.macPadding + constOptions.learn;
		var length_  = prepareLength(paket); 
		paket = constOptions.magicWord + length_ + constOptions.learnID + obj.common.mac + constOptions.macPadding + constOptions.learn;
		sendMessage(paket);
		adapter.log.info('I am send learnIR: ');
	}
		
	adapter.subscribeStates('*');
	
	adapter.checkPassword('admin', 'iobroker', function (res) {
        console.log('check user admin pw ioboker: ' + res);
    });

    adapter.checkGroup('admin', 'admin', function (res) {
        console.log('check group user admin group admin: ' + res);
    });
}
