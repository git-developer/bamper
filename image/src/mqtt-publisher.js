import debug from 'debug';
import deepmerge from 'deepmerge';
import fs from 'fs';
import mqtt from 'mqtt';

class MqttPublisher {

  constructor(name, config) {
    this.name = name;
    this.log = {
                 ...console,
                 debug: debug(this.name + ':mqtt'),
                 info: (...args) => console.info('MQTT: ' + args[0], ...(args.slice(1))),
                 warn: (...args) => console.warn('[WARN] MQTT: ' + args[0], ...(args.slice(1))),
                 error: (...args) => console.error('[ERROR] MQTT: ' + args[0], ...(args.slice(1))),
               };
    this.config = deepmerge.all([{ statusTopic: `${name}/status`, options: {} }, config]);
    if (!this.config.options.ca && config.caFile && fs.existsSync(config.caFile)) {
      this.log.debug('Reading CA certificate from %o', config.caFile);
      this.config.options.ca = fs.readFileSync(config.caFile, {encoding: 'utf-8'});
    }

    this.log.debug('Created publisher for %O', this.config);
  }

  publish = (...args) => this.client.publish(...args);

  publishStatus(message) {
    this.log.info(message);
    if (this.config.statusTopic) {
      if (this.client && this.client.connected) {
        this.client.publish(this.config.statusTopic, message);
      } else {
        this.log.warn('Currently disconnected, dropping status message');
      }
    }
  }

  start() {
    this.started = true;
    this.log.debug('%s is connecting to %s', this.name, this.config.url);
    const client = mqtt.connect(this.config.url, this.config.options);
    this.log.debug = debug(`${this.name}:mqtt:${client.options.clientId}`);
    client.on('connect', () => this.publishStatus(`${client.options.clientId} is connected`) );
    client.on('close',   () => this.log.debug('Connection closed') );
    client.on('end',     () => this.log.debug('Client end') );
    client.on('offline', () => this.log.debug('Client offline') );
    client.on('error',   this.log.error);
    this.client = client;
  }

  stop(code, cause, onCompletion) {
    if (this.started) {
      this.started = false;
      const name = this.client.options.clientId;
      this.publishStatus(`${name} is disconnected (Cause: ${cause})`);
      this.client.end(false, { reasonCode: code, properties: { reasonString: cause } }, () => {
        this.log.debug('Disconnected');
        this.log.debug = debug(`${this.name}:mqtt`);
        if (onCompletion) {
          onCompletion();
        }
      });
    };
  }
}

export default MqttPublisher;
