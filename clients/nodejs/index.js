#!/usr/bin/env node
const Nimiq = require('nimiq');
const argv = require('minimist')(process.argv.slice(2));
const fs = require('fs');

class Config {
    constructor(file) {
        this._config = [];
        if (fs.existsSync(file)) {
            try {
                this._config = JSON.parse(fs.readFileSync(file));
            } catch (e) {
                // Ignore
            }
        }
    }

    contains(key) {
        return this.get(key, undefined) !== undefined;
    }

    get(key, defaultValue) {
        return this._config[key] || defaultValue;
    }
}

const cfg = new Config('config/config.json');

const host = argv.host ? argv.host : cfg.get('host', undefined);
const port = argv.port ? argv.port : cfg.get('port', undefined);
const key = argv.key ? argv.key : cfg.get('key', undefined);
const cert = argv.cert ? argv.cert : cfg.get('cert', undefined);
const passive = argv.passive ? argv.passive : cfg.get('passive', false);
const miner = argv.miner ? argv.miner : cfg.get('miner', undefined);
const minerSpeed = argv['miner-speed'] ? argv['miner-speed'] : cfg.get('miner-speed', 75);
const log = argv['log'] ? argv['log'] : cfg.get('log', false);
const logTag = argv['log-tag'] ? argv['log-tag'] : cfg.get('log-tag', false);

if (argv.help || !host || !port || !key || !cert) {
    console.log('Usage: node index.js --host=<hostname> --port=<port> --key=<ssl-key> --cert=<ssl-cert> [--miner] [--passive] [--log=LEVEL] [--log-tag=TAG[:LEVEL]]');
    process.exit();
}

if (log) {
    Nimiq.Log.instance.level = log === true ? Nimiq.Log.VERBOSE : log;
}
if (logTag) {
    if (!Array.isArray(logTag)) {
        logTag = [logTag];
    }
    logTag.forEach((lt) => {
        let s = lt.split(':');
        Nimiq.Log.instance.setLoggable(s[0], s.length == 1 ? 2 : s[1]);
    });
}

console.log('Nimiq NodeJS Client starting (host=' + host + ', port=' + port + ', miner=' + !!miner + ', passive=' + !!passive + ')');

// XXX Configure Core.
// TODO Create config/options object and pass to Core.get()/init().
NetworkConfig.configurePeerAddress(host, parseInt(port));
NetworkConfig.configureSSL(key, cert);

(new Nimiq.Core()).then($ => {
    console.log('Blockchain: height=' + $.blockchain.height + ', totalWork=' + $.blockchain.totalWork + ', headHash=' + $.blockchain.headHash.toBase64());

    if (!passive) {
        $.network.connect();
    }

    if (miner) {
        $.consensus.on('established', () => $.miner.startWork());
        $.consensus.on('lost', () => $.miner.stopWork());
    }
});
