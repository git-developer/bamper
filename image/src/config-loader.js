import debug from 'debug';
import deepmerge from 'deepmerge';
import DotObject from 'dot-object';
import fs from 'fs';
import YAML from 'yaml';

const DEFAULT_CONFIG = { sources: [{}], targets: [] };
const DEFAULT_CONFIG_PATH = '/etc/pimper.yml';
const DEFAULT_ARG_KEY = 'targets.0.url';
const ENCODING = 'utf-8';
const ARG_SEPARATOR = '=';

class ConfigLoader {

  constructor(name) {
    this.name = name;
    this.log = { ...console, debug: debug(this.name + ':cfg') };
  }

  /*
   * Merge strategy taken from
   * https://www.npmjs.com/package/deepmerge#arraymerge-example-combine-arrays
   */
  combineMerge(target, source, options) {
    const destination = target.slice();
    source.forEach((item, index) => {
        if (typeof destination[index] === 'undefined') {
            destination[index] = options.cloneUnlessOtherwiseSpecified(item, options);
        } else if (options.isMergeableObject(item)) {
            destination[index] = deepmerge(target[index], item, options);
        } else if (target.indexOf(item) === -1) {
            destination.push(item);
        }
    });
    return destination;
  }

  splitArg = separator => (arg) => {
    const index = arg.indexOf(separator);
    var key, value;
    if (index > 0 && !URL.canParse(arg)) {
      [key, value] = [arg.substring(0, index), arg.substring(index + separator.length)];
    } else {
      this.log.info('Using unqualified arg %o as URL', arg);
      [key, value] = [DEFAULT_ARG_KEY, arg];
    }
    return {[key]: value};
  }

  load(args) {

    /* config from default */
    const configs = [DEFAULT_CONFIG];

    /* config from file */
    const CONFIG_PATH = process.env.PIMPER_CONFIG_PATH || DEFAULT_CONFIG_PATH;
    const stats = fs.statSync(CONFIG_PATH, { throwIfNoEntry: false });
    if (stats && stats.isFile()) {
      configs.push(YAML.parse(fs.readFileSync(CONFIG_PATH, ENCODING)));
    }

    /* config from args */
    if (args) {
      const argsConfig = DotObject.object(deepmerge.all(args.map(this.splitArg(ARG_SEPARATOR)).filter(x => x)));
      this.log.debug('Configuration from args: %o', argsConfig);
      configs.push(argsConfig);
    }

    const config = deepmerge.all(configs, { arrayMerge: this.combineMerge });

    this.log.debug('Configuration: %O', config);
    return config;
  }
}

export default ConfigLoader;
