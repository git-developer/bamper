import constants from 'constants';
import debug from 'debug';
import ConfigLoader from './config-loader.js';
import MessageProvider from './message-provider.js';
import MqttPublisher from './mqtt-publisher.js';

const MODULE_NAME = 'pimper';
const CODE_SUCCESS = 0;
const CODE_ERROR = 1;

const registerHandlers = (handle, onInterrupt, onReload) => {
  process.on('uncaughtException', (ex, origin) => handle(CODE_ERROR, ex, onInterrupt));
  const handlers = { 'SIGINT': onInterrupt, 'SIGTERM': onInterrupt, 'SIGHUP': onInterrupt };
  for (const signal in handlers) {
    process.on(signal, () => handle((constants[signal] + 128) || CODE_ERROR, `Signal ${signal}`, handlers[signal]));
  }
}

class Pimper {

  constructor(name) {
    this.name = name;
    this.log = {
      ...console,
      debug: debug(this.name + ':main'),
    };

    this.providers = [];
    this.publishers = [];
  }

  start(args) {
    this.started = true;
    this.log.info('Starting');

    const mainCfg = new ConfigLoader(this.name).load(args);

    mainCfg.targets.forEach(targetCfg =>
      this.publishers.push(new MqttPublisher(this.name, targetCfg)));

    const onMessage = (...args) => this.publishers.forEach(publisher => publisher.publish(...args));
    const onClose = source => this.stop(CODE_SUCCESS, `${source} was closed`, () => process.exit(CODE_SUCCESS));
    const baseConfig = { ...(mainCfg.topicSeparator && { topicSeparator: mainCfg.topicSeparator }) };
    mainCfg.sources.forEach(sourceCfg =>
      this.providers.push(new MessageProvider(this.name, onMessage, onClose, baseConfig, sourceCfg)));

    [...this.publishers, ...this.providers].forEach(startable => startable.start());
    this.log.debug('Started');
  }

  stop = (code, cause, onCompletion) => {
    if (this.started) {
      this.started = false;
      this.log.debug('Stopping');

      const [level, message] = code === CODE_ERROR ? ['error', `${cause.name}: ${cause.message}`] : ['info', cause];
      this.log[level](message);

      const stopActions = [...this.providers, ...this.publishers].reduce(
        (all, s) => all.concat(new Promise(resolve => s.stop(code, message, resolve))), []);
      Promise.all(stopActions).finally(result => {
        this.providers = [];
        this.publishers = [];
        this.log.info('Stopped %s', code === CODE_SUCCESS ? 'successfully' : `with exit code ${code}`);
        onCompletion(code);
      });
    }
  }

  static main(args) {
    const pimper = new Pimper(process.env.PIMPER_NAME || MODULE_NAME);
    registerHandlers(pimper.stop, process.exit, (code) => pimper.start(args));
    pimper.start(args);
  }
}

export default Pimper.main;
