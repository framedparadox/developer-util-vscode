import { parseJsonc } from '../jsonc';
import { Parser } from '../types';

export class JSONParser implements Parser {
    parse(content: string): any {
        return parseJsonc(content);
    }
}
