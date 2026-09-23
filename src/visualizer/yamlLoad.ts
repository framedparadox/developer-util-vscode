import * as yaml from 'js-yaml';

export function loadYamlDocument(content: string): unknown {
    return yaml.load(content, {
        schema: yaml.JSON_SCHEMA,
        json: true,
    });
}
