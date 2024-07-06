import debug from 'debug';
import deepmerge from 'deepmerge';
import fs from 'fs';
import { mkfifoSync } from 'named-pipe';
import readline from 'readline';

const DEFAULT_CONFIG = { file: '/var/run/pimper/source', topicSeparator: ' ', onClose: 'shutdown' };

class MessageProvider {

  constructor(name, onMessage, onClose, ...configs) {
    this.name = name;
    this.onMessage = onMessage;
    this.onClose = onClose;
    this.config = deepmerge.all([DEFAULT_CONFIG, ...configs]);
    this.log = {
      ...console,
      debug: debug(this.name + ':source:' + this.config.file),
      info: (...args) => console.info('%o ' + args[0], ...([this.config.file, ...(args.slice(1))])),
      warn: (...args) => console.warn('[WARN] %o ' + args[0], ...([this.config.file, ...(args.slice(1))])),
    };
    this.log.debug('Created provider');
  }

  start(verbose = true) {
    this.started = true;
    this.log.debug('Source is opening');
    if (!fs.existsSync(this.config.file)) {
      this.log.debug('Creating named pipe');
      mkfifoSync(this.config.file, 622);
    }
    if (!fs.statSync(this.config.file).isFIFO()) {
      this.log.warn('Source is not a named pipe');
    }

    this.release();
    this.stream = readline.createInterface({
      input: fs.createReadStream(this.config.file),
      terminal: false
    });

    this.stream.on('line', (line) => {
      this.log.debug('Line: %s', line);
      const sep = this.config.topicSeparator;
      const index = line.indexOf(sep);
      const [topic, content] = index > 0
        ? [line.substring(0, index), line.substring(index + sep.length)]
        : [line, null];
      this.onMessage(topic, content);
    });

    this.stream.on('close', () => {
      this.log.debug('Source is closed');
      if (this.started) { // Prevent reopen on stop()
        switch(this.config.onClose) {
          case 'ignore': break;
          case 'reopen': this.start(false); break;
          default: this.onClose(this.config.file); break;
        }
      }
    });
    if (verbose) {
      this.log.info('Source is open');
    }
  }

  stop(code, cause, onCompletion) {
    if (this.started) {
      this.started = false;
      this.log.debug('Source is closing');
      this.release();
      this.log.info('Source is closed');
      if (onCompletion) {
        onCompletion();
      }
    };
  }

  release() {
    if (this.stream) {
        fs.writeFileSync(this.config.file, '\n'); //XXX Without this write, application blocks on termination (at least for /dev/stdin)
        this.stream.close();
    }
  }
}

export default MessageProvider;
