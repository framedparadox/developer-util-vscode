import * as yaml from 'js-yaml';
import { Parser } from '../types';

export class YAMLParser implements Parser {
    parse(content: string): any {
        try {
            return yaml.load(content);
        } catch (error) {
            throw new Error(`YAML parsing failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}
