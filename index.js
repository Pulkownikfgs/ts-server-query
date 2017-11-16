'use strict'

const Telnet = require('telnet-client');
const Promise = require('bluebird');

const swapKeyValues = function swapKeyValues(obj) {
  var result = {};
  for (const key in obj) {
    result[obj[key]] = key;
  }
  return result;
};

const connectPrompt = 'Welcome to the TeamSpeak 3 ServerQuery interface, type \
"help" for a list of commands and "help <command>" for information on a \
specific command.\n\r';

const statusRegex = /error id=([0-9]+) msg=[a-zA-Z\\s]+(?: failed_permid=[0-9]+)?/;

const escapeMap = {
  '\\': '\\\\',
  '/': '\\/',
  ' ': '\\s',
  '|': '\\p',
  '\u0007': '\\a',
  '\f': '\\f',
  '\n': '\\n',
  '\r': '\\r',
  '\t': '\\t',
  '\v': '\\v',
};

const unescapeMap = swapKeyValues(escapeMap);

const escape = function escape(str, map = escapeMap) {
  let result = str;
  if (typeof result !== 'string') {
    return result;
  }

  for (const key in map) {
    result = result.split(key).join(map[key]);
  }
  return result;
};

const unescape = function unescape(str) {
  return escape(str, unescapeMap);
};

const ServerQuery = class ServerQuery {
  constructor() {
    this.telnet = new Telnet();
  }

  connect(params) {
    return new Promise(async (resolve, reject) => {
      let telnetParams = {
        host: params.host,
        port: params.port,
        shellPrompt: connectPrompt,
        stripShellPrompt: false,
      };

      await this.telnet.connect(telnetParams);
      resolve();
    });
  }

  command(name, kvargs, args) {
    const argsOnly = (kvargs && Array.isArray(kvargs));
    const _args = (argsOnly ? kvargs : args) || [];
    const _kvargs = (!argsOnly ? kvargs : undefined) || {};

    return new Promise(async (resolve, reject) => {
      let cmd = name;
      cmd = Object.entries(_kvargs).reduce((result, kv) => (
        `${result} ${escape(kv[0])}=${escape(kv[1])}`
      ), cmd);

      cmd = _args.reduce((result, arg) => (
        `${result} ${escape(arg)}`
      ), cmd);

      const res = await this.telnet.exec(cmd, {
        shellPrompt: statusRegex,
        echoLines: 0,
      });

      // console.log(res);

      const statusMatch = res.match(statusRegex);
      if (statusMatch.index >= 0) {
        const errorId = statusMatch[1];

        if (errorId !== '0') {
          reject(new Error(unescape(statusMatch[0])));
        }

        const result =
          res.substring(0, statusMatch.index)
          .replace('\n\r', '')
          .split('|')
          .map(part => part.split(' ').reduce((obj, kvpair) => {
            const split = kvpair.indexOf('=');
            const key = split >= 0 ? kvpair.substring(0, split) : kvpair;
            const value = split >= 0 ? unescape(kvpair.substring(split + 1)) : '';
            obj[key] = value;
            return obj;
          }, {}));

        resolve(result);
      }
      else {
        reject(new Error('no status string'));
      }
    });
  }
};

module.exports = ServerQuery;
