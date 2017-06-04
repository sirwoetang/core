#!/usr/bin/env node

// This code is a based on greenlock-cli (see https://git.daplie.com/Daplie/greenlock-cli)
// but it has been heavily modified to fit the spacific purposes of a nimiq-cli installation.

'use strict';

const LE = require('greenlock');
const argv = require('minimist')(process.argv.slice(2));
const fs = require('fs');

if (!argv.host || !argv.email || !argv['accept-le-tos']) {
    console.log('Usage: ./scripts/install.js --host=<hostname> --email=<email> --accept-le-tos [--debug]');
    process.exit();
}

run();

function run() {
  let leChallenge;
  let leStore;
  let servers;

  leChallenge = require('le-challenge-standalone').create({});
  servers = require('../lib/servers').create(leChallenge);

  leStore = require('le-store-certbot').create({
    configDir: './config/letsencrypt'
  });

  const leChallenges = {
    'http-01': leChallenge
  };

  const le = LE.create({
    debug: argv.debug
  , server: 'https://acme-v01.api.letsencrypt.org/directory'
  , store: leStore
  , challenges: leChallenges
  , renewWithin:  31536000000
  , duplicate: true
  });

  servers.startServers([80], [], { debug: argv.debug });

  return le.register({
    debug: argv.debug
  , email: argv.email
  , agreeTos: true
  , domains: [argv.host]
  , rsaKeySize: 2048
  , challengeType: 'http-01'
  }).then(function (certs) {
    if (!certs._renewing) {
      return certs;
    }
    console.log("");
    console.log("Got certificate(s) for " + certs.altnames.join(', '));
    console.log("\tIssued at " + new Date(certs.issuedAt).toISOString() + "");
    console.log("\tValid until " + new Date(certs.expiresAt).toISOString() + "");
    console.log("");
    console.log("Renewing them now");
    return certs._renewing;
  }).then(function (certs) {

    const json = JSON.stringify({
      'host': argv.host,
      'port': 4242,
      'key': `./config/letsencrypt/live/${argv.host}/privkey.pem`,
      'cert': `./config/letsencrypt/live/${argv.host}/fullchain.pem`
    });

    try {
      fs.writeFileSync('./config/config.json', json, 'utf8');
    } catch (e) {
      throw e;
    }

    console.log("");
    console.log("Got certificate(s) for " + certs.altnames.join(', '));
    console.log("\tIssued at " + new Date(certs.issuedAt).toISOString() + "");
    console.log("\tValid until " + new Date(certs.expiresAt).toISOString() + "");
    console.log("");
    console.log('Private key installed');
    console.log('Certificates installed');
    console.log("");
    console.log("You can now run nimiq-cli with ./index.js");

    return servers.closeServers({ debug: argv.debug }).then(function() {
      return 0;
    });

    return 0;
  }, function (err) {
    console.error('[Error]: ./scripts/install.js');
    console.error(err.stack || new Error('get stack').stack);

    return 1;
  });

};
