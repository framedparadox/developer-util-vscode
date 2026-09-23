import * as crypto from 'crypto';
import * as yaml from 'js-yaml';
import * as Papa from 'papaparse';
import { loadYamlDocument } from '../visualizer/yamlLoad';
import { choice, readInteger, requireText } from './common';
import type { UtilityTool } from './types';

// smol-toml publishes a CommonJS build but only ESM type declarations, so load it with require.
const { parse: parseToml, stringify: stringifyToml } = require('smol-toml') as {
    parse(text: string, options?: { integersAsBigInt?: boolean | 'asNeeded' }): Record<string, unknown>;
    stringify(value: unknown): string;
};

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

function parseJson(value: string, label = 'JSON'): Json {
    const text = requireText(value, label);
    try {
        return JSON.parse(text) as Json;
    } catch (error) {
        throw new Error(`${label} is not valid: ${error instanceof Error ? error.message : String(error)}`);
    }
}

function isObject(value: unknown): value is Record<string, Json> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function childPath(base: string, key: string | number): string {
    if (typeof key === 'number') {
        return `${base}[${key}]`;
    }
    return /^[A-Za-z_$][\w$]*$/.test(key) ? `${base}.${key}` : `${base}[${JSON.stringify(key)}]`;
}

// ── JSON diff ────────────────────────────────────────────────────────────────

export interface JsonChange {
    kind: 'added' | 'removed' | 'changed';
    path: string;
    before?: Json;
    after?: Json;
}

export function diffJson(left: Json, right: Json, path = '$', changes: JsonChange[] = []): JsonChange[] {
    if (Array.isArray(left) && Array.isArray(right)) {
        const length = Math.max(left.length, right.length);
        for (let index = 0; index < length; index += 1) {
            const next = childPath(path, index);
            if (index >= left.length) {
                changes.push({ kind: 'added', path: next, after: right[index] });
            } else if (index >= right.length) {
                changes.push({ kind: 'removed', path: next, before: left[index] });
            } else {
                diffJson(left[index], right[index], next, changes);
            }
        }
        return changes;
    }
    if (isObject(left) && isObject(right)) {
        const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
        for (const key of keys) {
            const next = childPath(path, key);
            if (!(key in left)) {
                changes.push({ kind: 'added', path: next, after: right[key] });
            } else if (!(key in right)) {
                changes.push({ kind: 'removed', path: next, before: left[key] });
            } else {
                diffJson(left[key], right[key], next, changes);
            }
        }
        return changes;
    }
    if (JSON.stringify(left) !== JSON.stringify(right)) {
        changes.push({ kind: 'changed', path, before: left, after: right });
    }
    return changes;
}

function formatChange(change: JsonChange): string {
    const show = (value: Json | undefined) => JSON.stringify(value);
    if (change.kind === 'added') {
        return `+ ${change.path}: ${show(change.after)}`;
    }
    if (change.kind === 'removed') {
        return `- ${change.path}: ${show(change.before)}`;
    }
    return `~ ${change.path}: ${show(change.before)} -> ${show(change.after)}`;
}

// ── JSON / CSV ───────────────────────────────────────────────────────────────

export function flattenJson(value: Json, prefix = '', out: Record<string, Json> = {}): Record<string, Json> {
    if (Array.isArray(value)) {
        if (value.length === 0 && prefix) {
            out[prefix] = [];
        }
        value.forEach((item, index) => flattenJson(item, prefix ? `${prefix}.${index}` : String(index), out));
        return out;
    }
    if (isObject(value)) {
        const keys = Object.keys(value);
        if (keys.length === 0 && prefix) {
            out[prefix] = {};
        }
        for (const key of keys) {
            flattenJson(value[key], prefix ? `${prefix}.${key}` : key, out);
        }
        return out;
    }
    out[prefix] = value;
    return out;
}

export function unflattenJson(value: Json): Json {
    if (!isObject(value)) {
        throw new Error('Unflatten expects a JSON object with dotted keys.');
    }
    const root: Record<string, Json> = {};
    for (const [flatKey, item] of Object.entries(value)) {
        const parts = flatKey.split('.');
        let cursor: Record<string, Json> | Json[] = root;
        parts.forEach((part, index) => {
            const last = index === parts.length - 1;
            const nextIsIndex = !last && /^\d+$/.test(parts[index + 1]);
            const key: string | number = Array.isArray(cursor) ? Number(part) : part;
            const container = cursor as Record<string | number, Json>;
            if (last) {
                container[key] = item;
                return;
            }
            if (typeof container[key] !== 'object' || container[key] === null) {
                container[key] = nextIsIndex ? [] : {};
            }
            cursor = container[key] as Record<string, Json> | Json[];
        });
    }
    return root;
}

export function jsonToCsv(value: string, delimiter: string): string {
    const data = parseJson(value);
    const rows = Array.isArray(data) ? data : [data];
    if (rows.length === 0) {
        throw new Error('The JSON array is empty.');
    }
    const flat = rows.map((row) => (isObject(row) || Array.isArray(row) ? flattenJson(row) : { value: row }));
    const columns: string[] = [];
    for (const row of flat) {
        for (const key of Object.keys(row)) {
            if (!columns.includes(key)) {
                columns.push(key);
            }
        }
    }
    const records = flat.map((row) =>
        columns.map((column) => {
            const cell = row[column];
            if (cell === undefined || cell === null) {
                return '';
            }
            return typeof cell === 'object' ? JSON.stringify(cell) : String(cell);
        }),
    );
    return Papa.unparse({ fields: columns, data: records }, { delimiter, newline: '\n' });
}

export function csvToJson(value: string, delimiter: string): string {
    const text = requireText(value, 'CSV');
    const parsed = Papa.parse<Record<string, string>>(text.trim(), {
        header: true,
        delimiter,
        skipEmptyLines: true,
        dynamicTyping: true,
    });
    if (parsed.errors.length > 0) {
        const first = parsed.errors[0];
        throw new Error(`CSV row ${(first.row ?? 0) + 1}: ${first.message}`);
    }
    const rows = parsed.data.map((row) => unflattenJson(row as unknown as Json));
    return JSON.stringify(rows, null, 2);
}

// ── TOML ─────────────────────────────────────────────────────────────────────

export function convertToml(value: string, action: string): string {
    const text = requireText(value, 'Input');
    switch (action) {
        case 'toml-json':
            return JSON.stringify(parseToml(text, TOML_OPTIONS), tomlReplacer, 2);
        case 'toml-yaml':
            return yaml.dump(JSON.parse(JSON.stringify(parseToml(text, TOML_OPTIONS), tomlReplacer)), {
                lineWidth: -1,
                noRefs: true,
            });
        case 'json-toml':
            return tomlFromValue(parseJson(text));
        case 'yaml-toml':
            return tomlFromValue(loadYamlDocument(text) as Json);
        default:
            throw new Error('Unknown action.');
    }
}

// Integers beyond 2^53 are kept exact and shown as strings instead of failing the parse.
const TOML_OPTIONS = { integersAsBigInt: 'asNeeded' as const };

function tomlReplacer(_key: string, item: unknown): unknown {
    if (typeof item === 'bigint') {
        return item.toString();
    }
    return item;
}

function tomlFromValue(value: Json): string {
    if (!isObject(value)) {
        throw new Error('TOML documents must be a table (a JSON object at the top level).');
    }
    if (containsNull(value)) {
        throw new Error('TOML has no null value. Remove or replace null entries first.');
    }
    return stringifyToml(value);
}

function containsNull(value: Json): boolean {
    if (value === null) {
        return true;
    }
    if (Array.isArray(value)) {
        return value.some(containsNull);
    }
    return isObject(value) ? Object.values(value).some(containsNull) : false;
}

// ── JSON to code ─────────────────────────────────────────────────────────────

type Shape =
    | { kind: 'null' | 'boolean' | 'integer' | 'number' | 'string' | 'any' }
    | { kind: 'array'; item: Shape }
    | { kind: 'object'; name: string; fields: Array<{ key: string; shape: Shape; optional: boolean }> };

function pascal(value: string): string {
    const words = value
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .split(/[^A-Za-z0-9]+/)
        .filter(Boolean);
    const joined = words.map((word) => word[0].toUpperCase() + word.slice(1)).join('');
    if (!joined) {
        return 'Item';
    }
    return /^\d/.test(joined) ? `T${joined}` : joined;
}

function camel(value: string): string {
    const name = pascal(value);
    return name[0].toLowerCase() + name.slice(1);
}

function snake(value: string): string {
    const name = value
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .replace(/[^A-Za-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase();
    if (!name) {
        return 'field';
    }
    return /^\d/.test(name) ? `f_${name}` : name;
}

function singular(value: string): string {
    if (/ies$/i.test(value)) {
        return value.slice(0, -3) + 'y';
    }
    if (/ses$/i.test(value)) {
        return value.slice(0, -2);
    }
    if (/s$/i.test(value) && !/ss$/i.test(value)) {
        return value.slice(0, -1);
    }
    return `${value}Item`;
}

function inferShape(value: Json, name: string): Shape {
    if (value === null) {
        return { kind: 'null' };
    }
    if (typeof value === 'boolean') {
        return { kind: 'boolean' };
    }
    if (typeof value === 'number') {
        return { kind: Number.isInteger(value) ? 'integer' : 'number' };
    }
    if (typeof value === 'string') {
        return { kind: 'string' };
    }
    if (Array.isArray(value)) {
        const itemName = singular(name);
        const shapes = value.map((item) => inferShape(item, itemName));
        return {
            kind: 'array',
            item: shapes.reduce<Shape | undefined>((acc, next) => (acc ? mergeShape(acc, next) : next), undefined) ?? {
                kind: 'any',
            },
        };
    }
    return {
        kind: 'object',
        name: pascal(name),
        fields: Object.entries(value).map(([key, item]) => ({ key, shape: inferShape(item, key), optional: false })),
    };
}

function mergeShape(left: Shape, right: Shape): Shape {
    if (left.kind === right.kind) {
        if (left.kind === 'array' && right.kind === 'array') {
            return { kind: 'array', item: mergeShape(left.item, right.item) };
        }
        if (left.kind === 'object' && right.kind === 'object') {
            const keys = [...new Set([...left.fields.map((f) => f.key), ...right.fields.map((f) => f.key)])];
            return {
                kind: 'object',
                name: left.name,
                fields: keys.map((key) => {
                    const a = left.fields.find((f) => f.key === key);
                    const b = right.fields.find((f) => f.key === key);
                    if (a && b) {
                        const sometimesNull = a.shape.kind === 'null' || b.shape.kind === 'null';
                        return {
                            key,
                            shape: mergeShape(a.shape, b.shape),
                            optional: a.optional || b.optional || sometimesNull,
                        };
                    }
                    return { key, shape: (a ?? b)!.shape, optional: true };
                }),
            };
        }
        return left;
    }
    if ((left.kind === 'integer' && right.kind === 'number') || (left.kind === 'number' && right.kind === 'integer')) {
        return { kind: 'number' };
    }
    // A value that is sometimes null keeps its concrete type; the field is emitted as optional.
    if (left.kind === 'null') {
        return right;
    }
    if (right.kind === 'null') {
        return left;
    }
    return { kind: 'any' };
}

function collectObjects(
    shape: Shape,
    out: Array<Extract<Shape, { kind: 'object' }>> = [],
): Array<Extract<Shape, { kind: 'object' }>> {
    if (shape.kind === 'array') {
        collectObjects(shape.item, out);
    } else if (shape.kind === 'object') {
        const used = new Set(out.map((item) => item.name));
        let name = shape.name;
        for (let suffix = 2; used.has(name); suffix += 1) {
            name = `${shape.name}${suffix}`;
        }
        shape.name = name;
        out.push(shape);
        for (const field of shape.fields) {
            collectObjects(field.shape, out);
        }
    }
    return out;
}

interface Target {
    type: (shape: Shape) => string;
    render: (objects: Array<Extract<Shape, { kind: 'object' }>>, root: Shape, rootName: string) => string;
}

function hasNullable(shape: Shape): boolean {
    return shape.kind === 'null' || shape.kind === 'any';
}

const TARGETS: Record<string, Target> = {
    go: {
        type: (shape) => {
            switch (shape.kind) {
                case 'boolean':
                    return 'bool';
                case 'integer':
                    return 'int64';
                case 'number':
                    return 'float64';
                case 'string':
                    return 'string';
                case 'array':
                    return `[]${TARGETS.go.type(shape.item)}`;
                case 'object':
                    return shape.name;
                default:
                    return 'interface{}';
            }
        },
        render: (objects, root, rootName) => {
            const blocks = objects.map((object) => {
                const fields = object.fields.map((field) => {
                    const type = TARGETS.go.type(field.shape);
                    const pointer = field.optional && field.shape.kind === 'object' ? '*' : '';
                    const omit = field.optional ? ',omitempty' : '';
                    return `\t${pascal(field.key)} ${pointer}${type} \`json:"${field.key}${omit}"\``;
                });
                return `type ${object.name} struct {\n${fields.join('\n')}\n}`;
            });
            if (root.kind !== 'object') {
                blocks.unshift(`type ${pascal(rootName)} ${TARGETS.go.type(root)}`);
            }
            return blocks.join('\n\n');
        },
    },
    rust: {
        type: (shape) => {
            switch (shape.kind) {
                case 'boolean':
                    return 'bool';
                case 'integer':
                    return 'i64';
                case 'number':
                    return 'f64';
                case 'string':
                    return 'String';
                case 'array':
                    return `Vec<${TARGETS.rust.type(shape.item)}>`;
                case 'object':
                    return shape.name;
                default:
                    return 'serde_json::Value';
            }
        },
        render: (objects, root, rootName) => {
            const blocks = objects.map((object) => {
                const fields = object.fields.map((field) => {
                    const name = snake(field.key);
                    const rename = name === field.key ? '' : `    #[serde(rename = "${field.key}")]\n`;
                    let type = TARGETS.rust.type(field.shape);
                    if (field.optional || hasNullable(field.shape)) {
                        type = `Option<${type}>`;
                    }
                    return `${rename}    pub ${name}: ${type},`;
                });
                return `#[derive(Debug, Clone, Serialize, Deserialize)]\npub struct ${object.name} {\n${fields.join('\n')}\n}`;
            });
            if (root.kind !== 'object') {
                blocks.unshift(`pub type ${pascal(rootName)} = ${TARGETS.rust.type(root)};`);
            }
            return ['use serde::{Deserialize, Serialize};', ...blocks].join('\n\n');
        },
    },
    python: {
        type: (shape) => {
            switch (shape.kind) {
                case 'boolean':
                    return 'bool';
                case 'integer':
                    return 'int';
                case 'number':
                    return 'float';
                case 'string':
                    return 'str';
                case 'null':
                    return 'None';
                case 'array':
                    return `list[${TARGETS.python.type(shape.item)}]`;
                case 'object':
                    return shape.name;
                default:
                    return 'Any';
            }
        },
        render: (objects, root, rootName) => {
            const blocks = [...objects].reverse().map((object) => {
                const required = object.fields.filter((field) => !field.optional);
                const optional = object.fields.filter((field) => field.optional);
                const lines = [
                    ...required.map((field) => `    ${snake(field.key)}: ${TARGETS.python.type(field.shape)}`),
                    ...optional.map(
                        (field) => `    ${snake(field.key)}: Optional[${TARGETS.python.type(field.shape)}] = None`,
                    ),
                ];
                return `@dataclass\nclass ${object.name}:\n${lines.join('\n') || '    pass'}`;
            });
            if (root.kind !== 'object') {
                blocks.push(`${pascal(rootName)} = ${TARGETS.python.type(root)}`);
            }
            return [
                'from __future__ import annotations',
                '',
                'from dataclasses import dataclass',
                'from typing import Any, Optional',
                '',
                '',
                blocks.join('\n\n\n'),
            ].join('\n');
        },
    },
    java: {
        type: (shape) => {
            switch (shape.kind) {
                case 'boolean':
                    return 'Boolean';
                case 'integer':
                    return 'Long';
                case 'number':
                    return 'Double';
                case 'string':
                    return 'String';
                case 'array':
                    return `List<${TARGETS.java.type(shape.item)}>`;
                case 'object':
                    return shape.name;
                default:
                    return 'Object';
            }
        },
        render: (objects) => {
            const blocks = objects.map((object) => {
                const params = object.fields.map((field) => {
                    const name = camel(field.key);
                    const annotation = name === field.key ? '' : `@JsonProperty("${field.key}") `;
                    return `    ${annotation}${TARGETS.java.type(field.shape)} ${name}`;
                });
                return `public record ${object.name}(\n${params.join(',\n')}\n) {}`;
            });
            return [
                'import com.fasterxml.jackson.annotation.JsonProperty;',
                'import java.util.List;',
                '',
                blocks.join('\n\n'),
            ].join('\n');
        },
    },
    csharp: {
        type: (shape) => {
            switch (shape.kind) {
                case 'boolean':
                    return 'bool';
                case 'integer':
                    return 'long';
                case 'number':
                    return 'double';
                case 'string':
                    return 'string';
                case 'array':
                    return `List<${TARGETS.csharp.type(shape.item)}>`;
                case 'object':
                    return shape.name;
                default:
                    return 'object';
            }
        },
        render: (objects) => {
            const blocks = objects.map((object) => {
                const props = object.fields.map((field) => {
                    const nullable = field.optional || hasNullable(field.shape) ? '?' : '';
                    return `    [JsonPropertyName("${field.key}")]\n    public ${TARGETS.csharp.type(field.shape)}${nullable} ${pascal(field.key)} { get; set; }`;
                });
                return `public class ${object.name}\n{\n${props.join('\n\n')}\n}`;
            });
            return [
                'using System.Collections.Generic;',
                'using System.Text.Json.Serialization;',
                '',
                blocks.join('\n\n'),
            ].join('\n');
        },
    },
    kotlin: {
        type: (shape) => {
            switch (shape.kind) {
                case 'boolean':
                    return 'Boolean';
                case 'integer':
                    return 'Long';
                case 'number':
                    return 'Double';
                case 'string':
                    return 'String';
                case 'array':
                    return `List<${TARGETS.kotlin.type(shape.item)}>`;
                case 'object':
                    return shape.name;
                default:
                    return 'JsonElement';
            }
        },
        render: (objects) => {
            const blocks = objects.map((object) => {
                const params = object.fields.map((field) => {
                    const name = camel(field.key);
                    const serial = name === field.key ? '' : `@SerialName("${field.key}") `;
                    const nullable = field.optional || hasNullable(field.shape);
                    return `    ${serial}val ${name}: ${TARGETS.kotlin.type(field.shape)}${nullable ? '? = null' : ''}`;
                });
                return `@Serializable\ndata class ${object.name}(\n${params.join(',\n')}\n)`;
            });
            return [
                'import kotlinx.serialization.SerialName',
                'import kotlinx.serialization.Serializable',
                'import kotlinx.serialization.json.JsonElement',
                '',
                blocks.join('\n\n'),
            ].join('\n');
        },
    },
    swift: {
        type: (shape) => {
            switch (shape.kind) {
                case 'boolean':
                    return 'Bool';
                case 'integer':
                    return 'Int';
                case 'number':
                    return 'Double';
                case 'string':
                    return 'String';
                case 'array':
                    return `[${TARGETS.swift.type(shape.item)}]`;
                case 'object':
                    return shape.name;
                default:
                    return 'String';
            }
        },
        render: (objects) =>
            objects
                .map((object) => {
                    const props = object.fields.map((field) => {
                        const optional = field.optional || hasNullable(field.shape) ? '?' : '';
                        return `    let ${camel(field.key)}: ${TARGETS.swift.type(field.shape)}${optional}`;
                    });
                    const renamed = object.fields.filter((field) => camel(field.key) !== field.key);
                    const keys = renamed.length
                        ? `\n\n    enum CodingKeys: String, CodingKey {\n${object.fields
                              .map((field) =>
                                  camel(field.key) === field.key
                                      ? `        case ${field.key}`
                                      : `        case ${camel(field.key)} = "${field.key}"`,
                              )
                              .join('\n')}\n    }`
                        : '';
                    return `struct ${object.name}: Codable {\n${props.join('\n')}${keys}\n}`;
                })
                .join('\n\n'),
    },
    zod: {
        type: (shape) => {
            switch (shape.kind) {
                case 'boolean':
                    return 'z.boolean()';
                case 'integer':
                    return 'z.number().int()';
                case 'number':
                    return 'z.number()';
                case 'string':
                    return 'z.string()';
                case 'null':
                    return 'z.null()';
                case 'array':
                    return `z.array(${TARGETS.zod.type(shape.item)})`;
                case 'object':
                    return `${camel(shape.name)}Schema`;
                default:
                    return 'z.unknown()';
            }
        },
        render: (objects, root, rootName) => {
            const blocks = [...objects].reverse().map((object) => {
                const fields = object.fields.map((field) => {
                    const key = /^[A-Za-z_$][\w$]*$/.test(field.key) ? field.key : JSON.stringify(field.key);
                    return `  ${key}: ${TARGETS.zod.type(field.shape)}${field.optional ? '.optional()' : ''},`;
                });
                return `export const ${camel(object.name)}Schema = z.object({\n${fields.join('\n')}\n});\nexport type ${object.name} = z.infer<typeof ${camel(object.name)}Schema>;`;
            });
            if (root.kind !== 'object') {
                blocks.push(`export const ${camel(rootName)}Schema = ${TARGETS.zod.type(root)};`);
            }
            return ["import { z } from 'zod';", '', blocks.join('\n\n')].join('\n');
        },
    },
};

function schemaOf(shape: Shape): Record<string, unknown> {
    switch (shape.kind) {
        case 'array':
            return { type: 'array', items: schemaOf(shape.item) };
        case 'object':
            return {
                type: 'object',
                properties: Object.fromEntries(shape.fields.map((field) => [field.key, schemaOf(field.shape)])),
                required: shape.fields.filter((field) => !field.optional).map((field) => field.key),
            };
        case 'any':
            return {};
        default:
            return { type: shape.kind };
    }
}

export function jsonToCode(value: string, language: string, rootName: string): string {
    const data = parseJson(value);
    const name = pascal(rootName || 'Root');
    const root = inferShape(data, name);
    if (language === 'jsonschema') {
        return JSON.stringify(
            { $schema: 'https://json-schema.org/draft/2020-12/schema', title: name, ...schemaOf(root) },
            null,
            2,
        );
    }
    const target = TARGETS[language];
    if (!target) {
        throw new Error('Unsupported language.');
    }
    return target.render(collectObjects(root), root, name);
}

// ── JSON toolkit ─────────────────────────────────────────────────────────────

export function sortKeysDeep(value: Json): Json {
    if (Array.isArray(value)) {
        return value.map(sortKeysDeep);
    }
    if (isObject(value)) {
        return Object.fromEntries(
            Object.keys(value)
                .sort((a, b) => a.localeCompare(b))
                .map((key) => [key, sortKeysDeep(value[key])]),
        );
    }
    return value;
}

export function jsonToolkit(value: string, action: string, indent: number): string {
    switch (action) {
        case 'sort':
            return JSON.stringify(sortKeysDeep(parseJson(value)), null, indent);
        case 'flatten':
            return JSON.stringify(flattenJson(parseJson(value)), null, indent);
        case 'unflatten':
            return JSON.stringify(unflattenJson(parseJson(value)), null, indent);
        case 'stringify':
            return JSON.stringify(JSON.stringify(parseJson(value)));
        case 'parse': {
            const inner = parseJson(value, 'JSON string literal');
            if (typeof inner !== 'string') {
                throw new Error('Input must be a quoted JSON string, for example "{\\"a\\":1}".');
            }
            return JSON.stringify(parseJson(inner, 'Embedded JSON'), null, indent);
        }
        case 'keys':
            return Object.keys(flattenJson(parseJson(value))).join('\n');
        default:
            throw new Error('Unknown action.');
    }
}

// ── Shell tokenizer shared by docker and curl converters ─────────────────────

export function tokenizeShell(value: string): string[] {
    const text = value
        .replace(/\\\r?\n/g, ' ')
        .replace(/\^\r?\n/g, ' ')
        .replace(/`\r?\n/g, ' ');
    const tokens: string[] = [];
    let current = '';
    let started = false;
    let quote: '"' | "'" | '' = '';
    for (let index = 0; index < text.length; index += 1) {
        const char = text[index];
        if (quote === "'") {
            if (char === "'") {
                quote = '';
            } else {
                current += char;
            }
            continue;
        }
        if (quote === '"') {
            if (char === '"') {
                quote = '';
            } else if (char === '\\' && /["\\$`]/.test(text[index + 1] ?? '')) {
                current += text[index + 1];
                index += 1;
            } else {
                current += char;
            }
            continue;
        }
        if (char === "'" || char === '"') {
            quote = char;
            started = true;
            continue;
        }
        if (char === '\\' && index + 1 < text.length) {
            current += text[index + 1];
            index += 1;
            started = true;
            continue;
        }
        if (/\s/.test(char)) {
            if (started) {
                tokens.push(current);
                current = '';
                started = false;
            }
            continue;
        }
        current += char;
        started = true;
    }
    if (quote) {
        throw new Error('Unterminated quote in command.');
    }
    if (started) {
        tokens.push(current);
    }
    return tokens;
}

// ── docker run → compose ─────────────────────────────────────────────────────

const DOCKER_LIST_FLAGS: Record<string, string> = {
    '-p': 'ports',
    '--publish': 'ports',
    '-v': 'volumes',
    '--volume': 'volumes',
    '-e': 'environment',
    '--env': 'environment',
    '--env-file': 'env_file',
    '-l': 'labels',
    '--label': 'labels',
    '--cap-add': 'cap_add',
    '--cap-drop': 'cap_drop',
    '--device': 'devices',
    '--dns': 'dns',
    '--add-host': 'extra_hosts',
    '--expose': 'expose',
    '--tmpfs': 'tmpfs',
    '--security-opt': 'security_opt',
    '--group-add': 'group_add',
    '--sysctl': 'sysctls',
    '--link': 'links',
    '--volumes-from': 'volumes_from',
};

const DOCKER_VALUE_FLAGS: Record<string, string> = {
    '--name': 'container_name',
    '--restart': 'restart',
    '--network': 'network_mode',
    '--net': 'network_mode',
    '-w': 'working_dir',
    '--workdir': 'working_dir',
    '-u': 'user',
    '--user': 'user',
    '-h': 'hostname',
    '--hostname': 'hostname',
    '--entrypoint': 'entrypoint',
    '-m': 'mem_limit',
    '--memory': 'mem_limit',
    '--cpus': 'cpus',
    '--shm-size': 'shm_size',
    '--platform': 'platform',
    '--pid': 'pid',
    '--ipc': 'ipc',
    '--log-driver': 'logging.driver',
    '--stop-signal': 'stop_signal',
    '--pull': 'pull_policy',
    '--mac-address': 'mac_address',
    '--runtime': 'runtime',
    '--gpus': 'gpus',
};

const DOCKER_BOOL_FLAGS: Record<string, string> = {
    '--privileged': 'privileged',
    '-t': 'tty',
    '--tty': 'tty',
    '-i': 'stdin_open',
    '--interactive': 'stdin_open',
    '--init': 'init',
    '--read-only': 'read_only',
};

const DOCKER_IGNORED = new Set(['-d', '--detach', '--rm']);

export function dockerRunToCompose(value: string): { yaml: string; ignored: string[] } {
    const tokens = tokenizeShell(requireText(value, 'Command'));
    let index = 0;
    if (tokens[index] === 'sudo') {
        index += 1;
    }
    if (tokens[index] === 'docker' || tokens[index] === 'podman') {
        index += 1;
    }
    if (tokens[index] === 'container') {
        index += 1;
    }
    if (tokens[index] !== 'run' && tokens[index] !== 'create') {
        throw new Error('Expected a "docker run" command.');
    }
    index += 1;

    const service: Record<string, unknown> = {};
    const ignored: string[] = [];
    const push = (key: string, item: string) => {
        const list = (service[key] as string[] | undefined) ?? [];
        list.push(item);
        service[key] = list;
    };

    while (index < tokens.length) {
        const token = tokens[index];
        if (!token.startsWith('-') || token === '-') {
            break;
        }
        let flag = token;
        let inline: string | undefined;
        const eq = token.indexOf('=');
        if (token.startsWith('--') && eq > 0) {
            flag = token.slice(0, eq);
            inline = token.slice(eq + 1);
        }
        // Combined short booleans like -it or -dit.
        if (
            /^-[a-z]{2,}$/.test(token) &&
            [...token.slice(1)].every((c) => `-${c}` in DOCKER_BOOL_FLAGS || DOCKER_IGNORED.has(`-${c}`))
        ) {
            for (const c of token.slice(1)) {
                const key = DOCKER_BOOL_FLAGS[`-${c}`];
                if (key) {
                    service[key] = true;
                }
            }
            index += 1;
            continue;
        }
        const takeValue = () => {
            if (inline !== undefined) {
                return inline;
            }
            index += 1;
            if (index >= tokens.length) {
                throw new Error(`${flag} needs a value.`);
            }
            return tokens[index];
        };
        if (DOCKER_IGNORED.has(flag)) {
            index += 1;
            continue;
        }
        if (flag in DOCKER_BOOL_FLAGS) {
            service[DOCKER_BOOL_FLAGS[flag]] = true;
        } else if (flag in DOCKER_LIST_FLAGS) {
            push(DOCKER_LIST_FLAGS[flag], takeValue());
        } else if (flag in DOCKER_VALUE_FLAGS) {
            const key = DOCKER_VALUE_FLAGS[flag];
            const item = takeValue();
            if (key === 'logging.driver') {
                service.logging = { driver: item };
            } else if (key === 'entrypoint') {
                service.entrypoint = tokenizeShell(item);
            } else if (key === 'gpus') {
                service.deploy = {
                    resources: {
                        reservations: {
                            devices: [
                                {
                                    driver: 'nvidia',
                                    count: item === 'all' ? 'all' : Number(item) || item,
                                    capabilities: ['gpu'],
                                },
                            ],
                        },
                    },
                };
            } else {
                service[key] = key === 'cpus' ? Number(item) : item;
            }
        } else if (flag === '--health-cmd') {
            service.healthcheck = { ...(service.healthcheck as object), test: ['CMD-SHELL', takeValue()] };
        } else if (
            flag === '--health-interval' ||
            flag === '--health-timeout' ||
            flag === '--health-retries' ||
            flag === '--health-start-period'
        ) {
            const key = flag.slice('--health-'.length).replace('-', '_');
            const item = takeValue();
            service.healthcheck = {
                ...(service.healthcheck as object),
                [key]: key === 'retries' ? Number(item) : item,
            };
        } else if (flag === '--log-opt') {
            const [key, ...rest] = takeValue().split('=');
            const logging = (service.logging as { driver?: string; options?: Record<string, string> }) ?? {};
            logging.options = { ...(logging.options ?? {}), [key]: rest.join('=') };
            service.logging = logging;
        } else if (flag === '--ulimit') {
            const [key, limit] = takeValue().split('=');
            const [soft, hard] = (limit ?? '').split(':');
            const ulimits = (service.ulimits as Record<string, unknown>) ?? {};
            ulimits[key] = hard ? { soft: Number(soft), hard: Number(hard) } : Number(soft);
            service.ulimits = ulimits;
        } else if (flag === '--mount') {
            push('volumes', mountToVolume(takeValue()));
        } else {
            const next = tokens[index + 1];
            const hasValue =
                inline === undefined && next !== undefined && !next.startsWith('-') && index + 2 < tokens.length;
            ignored.push(hasValue ? `${flag} ${next}` : token);
            if (hasValue) {
                index += 1;
            }
        }
        index += 1;
    }

    const image = tokens[index];
    if (!image) {
        throw new Error('No image found after the options.');
    }
    service.image = image;
    const command = tokens.slice(index + 1);
    if (command.length) {
        service.command = command;
    }

    if (Array.isArray(service.environment)) {
        service.environment = (service.environment as string[]).map((item) => item);
    }

    const name =
        typeof service.container_name === 'string' ? service.container_name : image.split('/').pop()!.split(/[:@]/)[0];
    const ordered: Record<string, unknown> = { image: service.image };
    for (const [key, item] of Object.entries(service)) {
        if (key !== 'image') {
            ordered[key] = item;
        }
    }
    const doc = { services: { [snake(name).replace(/_/g, '-') || 'app']: ordered } };
    return { yaml: yaml.dump(doc, { lineWidth: -1, noRefs: true, quotingType: '"' }), ignored };
}

function mountToVolume(value: string): string {
    const parts = Object.fromEntries(
        value.split(',').map((part) => {
            const [key, ...rest] = part.split('=');
            return [key.trim(), rest.join('=') || 'true'];
        }),
    );
    const source = parts.source ?? parts.src ?? '';
    const target = parts.target ?? parts.destination ?? parts.dst ?? '';
    if (!target) {
        throw new Error('--mount needs a target.');
    }
    const readonly = parts.readonly === 'true' || parts.ro === 'true' ? ':ro' : '';
    return source ? `${source}:${target}${readonly}` : target;
}

// ── cURL → code ──────────────────────────────────────────────────────────────

export interface CurlRequest {
    method: string;
    url: string;
    headers: Array<[string, string]>;
    body?: string;
    user?: string;
    insecure: boolean;
    form: Array<[string, string]>;
}

export function parseCurl(value: string): CurlRequest {
    const tokens = tokenizeShell(requireText(value, 'Command'));
    if (tokens[0] !== 'curl' && tokens[0] !== 'curl.exe') {
        throw new Error('Command must start with curl.');
    }
    const request: CurlRequest = { method: '', url: '', headers: [], insecure: false, form: [] };
    const data: string[] = [];
    let getMode = false;
    for (let index = 1; index < tokens.length; index += 1) {
        const token = tokens[index];
        const next = () => {
            index += 1;
            if (index >= tokens.length) {
                throw new Error(`${token} needs a value.`);
            }
            return tokens[index];
        };
        switch (token) {
            case '-X':
            case '--request':
                request.method = next().toUpperCase();
                break;
            case '-H':
            case '--header': {
                const header = next();
                const colon = header.indexOf(':');
                if (colon > 0) {
                    request.headers.push([header.slice(0, colon).trim(), header.slice(colon + 1).trim()]);
                }
                break;
            }
            case '-d':
            case '--data':
            case '--data-raw':
            case '--data-binary':
            case '--data-ascii':
                data.push(next());
                break;
            case '--data-urlencode': {
                const item = next();
                const eq = item.indexOf('=');
                data.push(
                    eq >= 0
                        ? `${item.slice(0, eq)}=${encodeURIComponent(item.slice(eq + 1))}`
                        : encodeURIComponent(item),
                );
                break;
            }
            case '--json':
                data.push(next());
                request.headers.push(['Content-Type', 'application/json'], ['Accept', 'application/json']);
                break;
            case '-F':
            case '--form': {
                const item = next();
                const eq = item.indexOf('=');
                request.form.push([item.slice(0, eq), item.slice(eq + 1)]);
                break;
            }
            case '-u':
            case '--user':
                request.user = next();
                break;
            case '-A':
            case '--user-agent':
                request.headers.push(['User-Agent', next()]);
                break;
            case '-e':
            case '--referer':
                request.headers.push(['Referer', next()]);
                break;
            case '-b':
            case '--cookie':
                request.headers.push(['Cookie', next()]);
                break;
            case '-G':
            case '--get':
                getMode = true;
                break;
            case '-k':
            case '--insecure':
                request.insecure = true;
                break;
            case '-I':
            case '--head':
                request.method = 'HEAD';
                break;
            case '--url':
                request.url = next();
                break;
            case '-o':
            case '--output':
            case '-m':
            case '--max-time':
            case '--connect-timeout':
            case '-w':
            case '--write-out':
            case '--retry':
            case '-x':
            case '--proxy':
                next();
                break;
            default:
                if (!token.startsWith('-') && !request.url) {
                    request.url = token;
                }
        }
    }
    if (!request.url) {
        throw new Error('No URL found in the command.');
    }
    if (!/^[a-z]+:\/\//i.test(request.url)) {
        request.url = `http://${request.url}`;
    }
    if (data.length) {
        if (getMode) {
            request.url += (request.url.includes('?') ? '&' : '?') + data.join('&');
        } else {
            request.body = data.join('&');
            if (!request.headers.some(([key]) => key.toLowerCase() === 'content-type')) {
                request.headers.push(['Content-Type', 'application/x-www-form-urlencoded']);
            }
        }
    }
    if (!request.method) {
        request.method = request.body !== undefined || request.form.length ? 'POST' : 'GET';
    }
    return request;
}

function quote(value: string): string {
    return JSON.stringify(value);
}

function pyQuote(value: string): string {
    return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
}

function jsonBody(request: CurlRequest): unknown {
    const type = request.headers.find(([key]) => key.toLowerCase() === 'content-type')?.[1] ?? '';
    if (request.body === undefined || !type.includes('json')) {
        return undefined;
    }
    try {
        return JSON.parse(request.body);
    } catch {
        return undefined;
    }
}

export function curlToCode(value: string, target: string): string {
    const request = parseCurl(value);
    const headers = [...request.headers];
    if (request.user) {
        headers.push(['Authorization', `Basic ${Buffer.from(request.user).toString('base64')}`]);
    }
    switch (target) {
        case 'fetch': {
            const options: string[] = [`  method: ${quote(request.method)}`];
            if (headers.length) {
                options.push(
                    `  headers: {\n${headers.map(([k, v]) => `    ${quote(k)}: ${quote(v)}`).join(',\n')}\n  }`,
                );
            }
            const lines: string[] = [];
            if (request.form.length) {
                lines.push(
                    'const form = new FormData();',
                    ...request.form.map(([k, v]) => `form.append(${quote(k)}, ${quote(v)});`),
                    '',
                );
                options.push('  body: form');
            } else if (request.body !== undefined) {
                const parsed = jsonBody(request);
                options.push(
                    parsed !== undefined
                        ? `  body: JSON.stringify(${JSON.stringify(parsed, null, 2).replace(/\n/g, '\n  ')})`
                        : `  body: ${quote(request.body)}`,
                );
            }
            lines.push(
                `const response = await fetch(${quote(request.url)}, {\n${options.join(',\n')}\n});`,
                'const data = await response.text();',
            );
            return lines.join('\n');
        }
        case 'axios': {
            const config: string[] = [
                `  method: ${quote(request.method.toLowerCase())}`,
                `  url: ${quote(request.url)}`,
            ];
            if (headers.length) {
                config.push(
                    `  headers: {\n${headers.map(([k, v]) => `    ${quote(k)}: ${quote(v)}`).join(',\n')}\n  }`,
                );
            }
            if (request.body !== undefined) {
                const parsed = jsonBody(request);
                config.push(
                    `  data: ${parsed !== undefined ? JSON.stringify(parsed, null, 2).replace(/\n/g, '\n  ') : quote(request.body)}`,
                );
            }
            return `import axios from 'axios';\n\nconst response = await axios({\n${config.join(',\n')}\n});`;
        }
        case 'python': {
            const lines = ['import requests', ''];
            const args = [pyQuote(request.url)];
            if (headers.length) {
                lines.push(
                    `headers = {\n${headers.map(([k, v]) => `    ${pyQuote(k)}: ${pyQuote(v)},`).join('\n')}\n}`,
                );
                args.push('headers=headers');
            }
            if (request.form.length) {
                lines.push(
                    `files = {\n${request.form.map(([k, v]) => `    ${pyQuote(k)}: (None, ${pyQuote(v)}),`).join('\n')}\n}`,
                );
                args.push('files=files');
            } else if (request.body !== undefined) {
                const parsed = jsonBody(request);
                if (parsed !== undefined) {
                    lines.push(
                        `json_data = ${JSON.stringify(parsed, null, 4)
                            .replace(/\btrue\b/g, 'True')
                            .replace(/\bfalse\b/g, 'False')
                            .replace(/\bnull\b/g, 'None')}`,
                    );
                    args.push('json=json_data');
                } else {
                    lines.push(`data = ${pyQuote(request.body)}`);
                    args.push('data=data');
                }
            }
            if (request.insecure) {
                args.push('verify=False');
            }
            const simple = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD'].includes(request.method);
            const call = simple
                ? `requests.${request.method.toLowerCase()}(`
                : `requests.request(${pyQuote(request.method)}, `;
            lines.push(
                '',
                `response = ${call}${args.join(', ')})`,
                'print(response.status_code)',
                'print(response.text)',
            );
            return lines.join('\n');
        }
        case 'go': {
            const body = request.body !== undefined ? `strings.NewReader(${quote(request.body)})` : 'nil';
            const lines = [
                'package main',
                '',
                'import (',
                '\t"fmt"',
                '\t"io"',
                '\t"net/http"',
                ...(request.body !== undefined ? ['\t"strings"'] : []),
                ')',
                '',
                'func main() {',
                `\treq, err := http.NewRequest(${quote(request.method)}, ${quote(request.url)}, ${body})`,
                '\tif err != nil {',
                '\t\tpanic(err)',
                '\t}',
                ...headers.map(([k, v]) => `\treq.Header.Set(${quote(k)}, ${quote(v)})`),
                '',
                '\tresp, err := http.DefaultClient.Do(req)',
                '\tif err != nil {',
                '\t\tpanic(err)',
                '\t}',
                '\tdefer resp.Body.Close()',
                '\tdata, _ := io.ReadAll(resp.Body)',
                '\tfmt.Println(resp.Status)',
                '\tfmt.Println(string(data))',
                '}',
            ];
            return lines.join('\n');
        }
        case 'httpie': {
            const parts = ['http'];
            if (request.insecure) {
                parts.push('--verify=no');
            }
            if (request.form.length) {
                parts.push('--multipart');
            }
            parts.push(request.method, shellQuote(request.url));
            parts.push(...headers.map(([k, v]) => shellQuote(`${k}:${v}`)));
            parts.push(
                ...request.form.map(([k, v]) => shellQuote(v.startsWith('@') ? `${k}@${v.slice(1)}` : `${k}=${v}`)),
            );
            const command = parts.join(' ');
            return request.body !== undefined ? `printf '%s' ${shellQuote(request.body)} | ${command}` : command;
        }
        case 'powershell': {
            const lines: string[] = [];
            if (headers.length) {
                lines.push(
                    `$headers = @{\n${headers.map(([k, v]) => `    '${k.replace(/'/g, "''")}' = '${v.replace(/'/g, "''")}'`).join('\n')}\n}`,
                );
            }
            const args = [`-Uri '${request.url.replace(/'/g, "''")}'`, `-Method ${request.method}`];
            if (headers.length) {
                args.push('-Headers $headers');
            }
            if (request.body !== undefined) {
                args.push(`-Body '${request.body.replace(/'/g, "''")}'`);
            }
            if (request.insecure) {
                args.push('-SkipCertificateCheck');
            }
            lines.push(`Invoke-RestMethod ${args.join(' ')}`);
            return lines.join('\n');
        }
        default:
            throw new Error('Unsupported target.');
    }
}

function shellQuote(value: string): string {
    return /^[\w@%+=:,./-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`;
}

// ── List converter ───────────────────────────────────────────────────────────

export function convertList(
    value: string,
    options: { format: string; quote: string; trim: boolean; unique: boolean; sort: string; skipEmpty: boolean },
): string {
    let items = requireText(value, 'List')
        .split(/\r?\n|,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
        .map((item) => (options.trim ? item.trim() : item));
    if (!value.includes('\n')) {
        items = items.map((item) => item.trim());
    }
    if (options.skipEmpty) {
        items = items.filter((item) => item.length > 0);
    }
    if (options.unique) {
        items = [...new Set(items)];
    }
    if (options.sort === 'asc') {
        items.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    } else if (options.sort === 'desc') {
        items.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    }
    const wrap = (item: string) => {
        switch (options.quote) {
            case 'single':
                return `'${item.replace(/'/g, "''")}'`;
            case 'double':
                return `"${item.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
            case 'backtick':
                return `\`${item}\``;
            default:
                return item;
        }
    };
    switch (options.format) {
        case 'comma':
            return items.map(wrap).join(', ');
        case 'newline':
            return items.map(wrap).join('\n');
        case 'space':
            return items.map(wrap).join(' ');
        case 'pipe':
            return items.map(wrap).join(' | ');
        case 'tab':
            return items.map(wrap).join('\t');
        case 'sql':
            return `IN (${items.map((item) => (options.quote === 'none' && /^-?\d+(\.\d+)?$/.test(item) ? item : `'${item.replace(/'/g, "''")}'`)).join(', ')})`;
        case 'json':
            return JSON.stringify(items, null, 2);
        case 'markdown':
            return items.map((item) => `- ${item}`).join('\n');
        case 'html':
            return `<ul>\n${items.map((item) => `  <li>${item.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</li>`).join('\n')}\n</ul>`;
        default:
            throw new Error('Unknown format.');
    }
}

// ── Mock data ────────────────────────────────────────────────────────────────

const FIRST_NAMES = [
    'Ada',
    'Alan',
    'Grace',
    'Linus',
    'Margaret',
    'Dennis',
    'Barbara',
    'Ken',
    'Radia',
    'Tim',
    'Frances',
    'Guido',
    'Hedy',
    'James',
    'Katherine',
    'Bjarne',
    'Anita',
    'Donald',
    'Sophie',
    'Yukihiro',
];
const LAST_NAMES = [
    'Lovelace',
    'Turing',
    'Hopper',
    'Torvalds',
    'Hamilton',
    'Ritchie',
    'Liskov',
    'Thompson',
    'Perlman',
    'Berners-Lee',
    'Allen',
    'van Rossum',
    'Lamarr',
    'Gosling',
    'Johnson',
    'Stroustrup',
    'Borg',
    'Knuth',
    'Wilson',
    'Matsumoto',
];
const WORDS = [
    'alpha',
    'bravo',
    'cedar',
    'delta',
    'ember',
    'falcon',
    'granite',
    'harbor',
    'iris',
    'juniper',
    'kepler',
    'lumen',
    'maple',
    'nova',
    'orbit',
    'prism',
    'quartz',
    'raven',
    'sierra',
    'tundra',
];
const CITIES = [
    'Berlin',
    'Tokyo',
    'Toronto',
    'Lagos',
    'Lima',
    'Oslo',
    'Seoul',
    'Austin',
    'Nairobi',
    'Lisbon',
    'Mumbai',
    'Sydney',
];
const COUNTRIES = ['DE', 'JP', 'CA', 'NG', 'PE', 'NO', 'KR', 'US', 'KE', 'PT', 'IN', 'AU'];
const MOCK_TYPES = [
    'id',
    'uuid',
    'firstName',
    'lastName',
    'name',
    'email',
    'username',
    'phone',
    'int',
    'float',
    'bool',
    'date',
    'datetime',
    'word',
    'sentence',
    'city',
    'country',
    'ipv4',
    'ipv6',
    'url',
    'color',
    'enum',
];

function pick<T>(items: readonly T[]): T {
    return items[crypto.randomInt(items.length)];
}

interface MockField {
    name: string;
    type: string;
    args: string[];
}

export function parseMockSchema(value: string): MockField[] {
    const text = requireText(value, 'Schema');
    const fields = text
        .split(/[\n,](?![^(]*\))/)
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => {
            const match = /^([A-Za-z_$][\w$-]*)\s*:\s*([A-Za-z]+)(?:\((.*)\))?$/.exec(part);
            if (!match) {
                throw new Error(`Cannot read field "${part}". Use name:type or name:type(args).`);
            }
            if (!MOCK_TYPES.includes(match[2])) {
                throw new Error(`Unknown type "${match[2]}". Types: ${MOCK_TYPES.join(', ')}.`);
            }
            return {
                name: match[1],
                type: match[2],
                args: match[3] ? match[3].split(/\s*[|;]\s*|\s*,\s*/).filter(Boolean) : [],
            };
        });
    if (fields.length === 0) {
        throw new Error('Schema has no fields.');
    }
    return fields;
}

function mockValue(field: MockField, row: number, person: { first: string; last: string }): Json {
    const num = (index: number, fallback: number) => {
        const parsed = Number(field.args[index]);
        return Number.isFinite(parsed) ? parsed : fallback;
    };
    switch (field.type) {
        case 'id':
            return row + 1;
        case 'uuid':
            return crypto.randomUUID();
        case 'firstName':
            return person.first;
        case 'lastName':
            return person.last;
        case 'name':
            return `${person.first} ${person.last}`;
        case 'email':
            return `${person.first}.${person.last}`.toLowerCase().replace(/[^a-z.]/g, '') + `${row + 1}@example.com`;
        case 'username':
            return `${person.first[0]}${person.last}`.toLowerCase().replace(/[^a-z]/g, '') + crypto.randomInt(10, 100);
        case 'phone':
            return `+1-555-${String(crypto.randomInt(100, 1000))}-${String(crypto.randomInt(0, 10000)).padStart(4, '0')}`;
        case 'int': {
            const min = num(0, 0);
            const max = num(1, 1000);
            return Math.floor(min + Math.random() * (max - min + 1));
        }
        case 'float': {
            const min = num(0, 0);
            const max = num(1, 1000);
            return Math.round((min + Math.random() * (max - min)) * 100) / 100;
        }
        case 'bool':
            return crypto.randomInt(2) === 1;
        case 'date':
        case 'datetime': {
            const start = Date.parse(field.args[0] ?? '2020-01-01');
            const end = Date.parse(field.args[1] ?? '2026-12-31');
            const time = new Date(start + Math.random() * Math.max(0, end - start));
            return field.type === 'date' ? time.toISOString().slice(0, 10) : time.toISOString();
        }
        case 'word':
            return pick(WORDS);
        case 'sentence': {
            const words = Array.from({ length: crypto.randomInt(4, 10) }, () => pick(WORDS));
            return `${words.join(' ').replace(/^./, (c) => c.toUpperCase())}.`;
        }
        case 'city':
            return pick(CITIES);
        case 'country':
            return pick(COUNTRIES);
        case 'ipv4':
            return [10, crypto.randomInt(256), crypto.randomInt(256), crypto.randomInt(1, 255)].join('.');
        case 'ipv6':
            return `fd00:${Array.from({ length: 7 }, () => crypto.randomInt(65536).toString(16)).join(':')}`;
        case 'url':
            return `https://example.com/${pick(WORDS)}/${row + 1}`;
        case 'color':
            return `#${crypto.randomBytes(3).toString('hex')}`;
        case 'enum':
            if (field.args.length === 0) {
                throw new Error(`${field.name}: enum needs options, for example enum(a|b|c).`);
            }
            return pick(field.args);
        default:
            return null;
    }
}

export function generateMockData(schema: string, count: number, format: string): string {
    const fields = parseMockSchema(schema);
    const rows = Array.from({ length: count }, (_, row) => {
        const person = { first: pick(FIRST_NAMES), last: pick(LAST_NAMES) };
        return Object.fromEntries(fields.map((field) => [field.name, mockValue(field, row, person)])) as Record<
            string,
            Json
        >;
    });
    switch (format) {
        case 'json':
            return JSON.stringify(rows, null, 2);
        case 'ndjson':
            return rows.map((row) => JSON.stringify(row)).join('\n');
        case 'csv':
            return Papa.unparse(rows, { newline: '\n' });
        case 'sql': {
            const columns = fields.map((field) => field.name).join(', ');
            return rows
                .map((row) => {
                    const cells = fields.map((field) => {
                        const cell = row[field.name];
                        if (typeof cell === 'number') {
                            return String(cell);
                        }
                        if (typeof cell === 'boolean') {
                            return cell ? 'TRUE' : 'FALSE';
                        }
                        return `'${String(cell).replace(/'/g, "''")}'`;
                    });
                    return `INSERT INTO items (${columns}) VALUES (${cells.join(', ')});`;
                })
                .join('\n');
        }
        case 'yaml':
            return yaml.dump(rows, { lineWidth: -1 });
        default:
            throw new Error('Unknown format.');
    }
}

// ── Tool definitions ─────────────────────────────────────────────────────────

const DELIMITERS = [
    { value: ',', label: 'Comma' },
    { value: ';', label: 'Semicolon' },
    { value: '\t', label: 'Tab' },
    { value: '|', label: 'Pipe' },
];

export const dataTools: UtilityTool[] = [
    {
        id: 'json-diff',
        label: 'JSON Diff',
        description: 'Compare two JSON documents structurally',
        command: 'devx.jsonDiffTool',
        icon: 'json-diff.svg',
        defaultVisible: true,
        category: 'Data',
        summary:
            'Walks both documents and lists added (+), removed (-), and changed (~) values by JSONPath. Key order is ignored; array items are compared by index.',
        fields: [
            { id: 'left', label: 'Original JSON', kind: 'textarea', rows: 10 },
            { id: 'right', label: 'Changed JSON', kind: 'textarea', rows: 10 },
        ],
        actions: [
            { id: 'compare', label: 'Compare' },
            { id: 'patch', label: 'JSON Patch (RFC 6902)' },
        ],
        run: (action, values) => {
            const changes = diffJson(
                parseJson(values.left ?? '', 'Original JSON'),
                parseJson(values.right ?? '', 'Changed JSON'),
            );
            if (action === 'patch') {
                const pointer = (path: string) =>
                    path
                        .slice(1)
                        .split(/\.|\[|\]/)
                        .filter(Boolean)
                        .map((part) => (part.startsWith('"') ? JSON.parse(part) : part))
                        .map((part: string) => '/' + part.replace(/~/g, '~0').replace(/\//g, '~1'))
                        .join('');
                const removals = changes.filter((c) => c.kind === 'removed').reverse();
                const ops = [...changes.filter((c) => c.kind !== 'removed'), ...removals].map((change) =>
                    change.kind === 'removed'
                        ? { op: 'remove', path: pointer(change.path) }
                        : {
                              op: change.kind === 'added' ? 'add' : 'replace',
                              path: pointer(change.path),
                              value: change.after,
                          },
                );
                return { output: JSON.stringify(ops, null, 2), notice: `${ops.length} operation(s).` };
            }
            if (changes.length === 0) {
                return { output: 'No differences.', notice: 'The documents are equivalent.' };
            }
            const counts = ['added', 'removed', 'changed']
                .map((kind) => `${changes.filter((c) => c.kind === kind).length} ${kind}`)
                .join(', ');
            return { output: changes.map(formatChange).join('\n'), notice: counts };
        },
    },
    {
        id: 'json-csv',
        label: 'JSON / CSV',
        description: 'Convert JSON arrays to CSV and back',
        command: 'devx.jsonCsvTool',
        icon: 'json-csv.svg',
        defaultVisible: true,
        category: 'Data',
        summary:
            'Nested objects become dotted column names (address.city) and are rebuilt when converting back. Numbers and booleans in CSV are typed automatically.',
        fields: [
            {
                id: 'input',
                label: 'Input',
                kind: 'textarea',
                rows: 12,
                placeholder: '[{"id":1,"name":"Ada","address":{"city":"London"}}]',
            },
            { id: 'delimiter', label: 'Delimiter', kind: 'select', options: DELIMITERS, defaultValue: ',' },
        ],
        actions: [
            { id: 'to-csv', label: 'JSON → CSV' },
            { id: 'to-json', label: 'CSV → JSON' },
        ],
        run: (action, values) => {
            const delimiter = choice(
                values.delimiter,
                'delimiter',
                DELIMITERS.map((d) => d.value),
                ',',
            );
            return {
                output:
                    action === 'to-json'
                        ? csvToJson(values.input ?? '', delimiter)
                        : jsonToCsv(values.input ?? '', delimiter),
            };
        },
    },
    {
        id: 'toml',
        label: 'TOML Converter',
        description: 'Convert TOML to JSON or YAML and back',
        command: 'devx.tomlTool',
        icon: 'toml.svg',
        defaultVisible: true,
        category: 'Data',
        summary:
            'Parses TOML 1.0 (Cargo.toml, pyproject.toml, config files). TOML has no null, so null values are rejected when converting to TOML.',
        fields: [
            {
                id: 'input',
                label: 'Input',
                kind: 'textarea',
                rows: 14,
                placeholder: '[package]\nname = "demo"\nversion = "0.1.0"',
            },
        ],
        actions: [
            { id: 'toml-json', label: 'TOML → JSON' },
            { id: 'toml-yaml', label: 'TOML → YAML' },
            { id: 'json-toml', label: 'JSON → TOML' },
            { id: 'yaml-toml', label: 'YAML → TOML' },
        ],
        run: (action, values) => ({ output: convertToml(values.input ?? '', action) }),
    },
    {
        id: 'json-code',
        label: 'JSON to Code',
        description: 'Generate types for Go, Rust, Python, Java, C#, Kotlin, Swift, Zod, or JSON Schema',
        command: 'devx.jsonToCodeTool',
        icon: 'json-code.svg',
        defaultVisible: true,
        category: 'Data',
        summary:
            'Infers types from a JSON sample. Array items are merged, so keys missing from some items become optional. Review the output: a single sample cannot reveal every type.',
        fields: [
            { id: 'input', label: 'JSON sample', kind: 'textarea', rows: 12 },
            {
                id: 'language',
                label: 'Target',
                kind: 'select',
                options: [
                    { value: 'go', label: 'Go struct' },
                    { value: 'rust', label: 'Rust (serde)' },
                    { value: 'python', label: 'Python dataclass' },
                    { value: 'java', label: 'Java record' },
                    { value: 'csharp', label: 'C# class' },
                    { value: 'kotlin', label: 'Kotlin data class' },
                    { value: 'swift', label: 'Swift Codable' },
                    { value: 'zod', label: 'Zod schema' },
                    { value: 'jsonschema', label: 'JSON Schema' },
                ],
                defaultValue: 'go',
            },
            { id: 'root', label: 'Root type name', kind: 'text', defaultValue: 'Root' },
        ],
        actions: [{ id: 'generate', label: 'Generate' }],
        run: (_action, values) => ({
            output: jsonToCode(values.input ?? '', values.language || 'go', values.root || 'Root'),
        }),
    },
    {
        id: 'json-toolkit',
        label: 'JSON Toolkit',
        description: 'Sort keys, flatten, unflatten, and stringify JSON',
        command: 'devx.jsonToolkitTool',
        icon: 'json-toolkit.svg',
        defaultVisible: true,
        category: 'Data',
        summary:
            'Sort object keys recursively, flatten to dotted keys, rebuild nested JSON, list every key path, or wrap JSON in (and unwrap it from) a string literal.',
        fields: [
            { id: 'input', label: 'JSON', kind: 'textarea', rows: 12 },
            { id: 'indent', label: 'Indent', kind: 'number', defaultValue: '2' },
        ],
        actions: [
            { id: 'sort', label: 'Sort keys' },
            { id: 'flatten', label: 'Flatten' },
            { id: 'unflatten', label: 'Unflatten' },
            { id: 'keys', label: 'List paths' },
            { id: 'stringify', label: 'To string literal' },
            { id: 'parse', label: 'From string literal' },
        ],
        run: (action, values) => ({
            output: jsonToolkit(values.input ?? '', action, readInteger(values.indent, 'Indent', 0, 8)),
        }),
    },
    {
        id: 'docker-compose',
        label: 'Docker Run to Compose',
        description: 'Convert a docker run command to docker-compose YAML',
        command: 'devx.dockerComposeTool',
        icon: 'docker.svg',
        defaultVisible: true,
        category: 'Data',
        summary:
            'Maps ports, volumes, --mount, env, labels, restart, network, user, healthcheck, logging, ulimits, capabilities, devices, and more to a Compose service. Unknown flags are listed so nothing is dropped silently.',
        fields: [
            {
                id: 'input',
                label: 'docker run command',
                kind: 'textarea',
                rows: 6,
                placeholder:
                    'docker run -d --name web -p 8080:80 -v ./html:/usr/share/nginx/html:ro -e TZ=UTC --restart unless-stopped nginx:alpine',
            },
        ],
        actions: [{ id: 'convert', label: 'Convert' }],
        run: (_action, values) => {
            const result = dockerRunToCompose(values.input ?? '');
            return {
                output: result.yaml,
                notice: result.ignored.length ? `Not converted: ${result.ignored.join(', ')}` : undefined,
            };
        },
    },
    {
        id: 'curl',
        label: 'cURL Converter',
        description: 'Convert curl commands to fetch, axios, Python, Go, HTTPie, or PowerShell',
        command: 'devx.curlTool',
        icon: 'curl.svg',
        defaultVisible: true,
        category: 'Data',
        summary:
            'Reads -X, -H, -d/--data*, --json, -F, -u, -A, -b, -G, -k, and -I. Paste the command from browser DevTools "Copy as cURL". Nothing is sent.',
        fields: [
            {
                id: 'input',
                label: 'curl command',
                kind: 'textarea',
                rows: 6,
                placeholder:
                    'curl -X POST https://api.example.com/items -H \'Content-Type: application/json\' -d \'{"name":"demo"}\'',
            },
            {
                id: 'target',
                label: 'Target',
                kind: 'select',
                options: [
                    { value: 'fetch', label: 'JavaScript fetch' },
                    { value: 'axios', label: 'JavaScript axios' },
                    { value: 'python', label: 'Python requests' },
                    { value: 'go', label: 'Go net/http' },
                    { value: 'httpie', label: 'HTTPie' },
                    { value: 'powershell', label: 'PowerShell' },
                ],
                defaultValue: 'fetch',
            },
        ],
        actions: [{ id: 'convert', label: 'Convert' }],
        run: (_action, values) => ({ output: curlToCode(values.input ?? '', values.target || 'fetch') }),
    },
    {
        id: 'list',
        label: 'List Converter',
        description: 'Turn lines into CSV, SQL IN, JSON arrays, and more',
        command: 'devx.listConverterTool',
        icon: 'list.svg',
        defaultVisible: true,
        category: 'Data',
        summary:
            'Split a list on new lines (or commas for a single line), then quote, dedupe, sort, and join it for SQL, JSON, Markdown, HTML, or shell use.',
        fields: [
            { id: 'input', label: 'List', kind: 'textarea', rows: 10 },
            {
                id: 'format',
                label: 'Output',
                kind: 'select',
                options: [
                    { value: 'comma', label: 'Comma separated' },
                    { value: 'sql', label: 'SQL IN (...)' },
                    { value: 'json', label: 'JSON array' },
                    { value: 'newline', label: 'One per line' },
                    { value: 'space', label: 'Space separated' },
                    { value: 'tab', label: 'Tab separated' },
                    { value: 'pipe', label: 'Pipe separated' },
                    { value: 'markdown', label: 'Markdown list' },
                    { value: 'html', label: 'HTML list' },
                ],
                defaultValue: 'comma',
            },
            {
                id: 'quote',
                label: 'Quote',
                kind: 'select',
                options: [
                    { value: 'none', label: 'None' },
                    { value: 'single', label: "Single '" },
                    { value: 'double', label: 'Double "' },
                    { value: 'backtick', label: 'Backtick `' },
                ],
                defaultValue: 'none',
            },
            {
                id: 'sort',
                label: 'Sort',
                kind: 'select',
                options: [
                    { value: 'none', label: 'Keep order' },
                    { value: 'asc', label: 'A → Z' },
                    { value: 'desc', label: 'Z → A' },
                ],
                defaultValue: 'none',
            },
            {
                id: 'unique',
                label: 'Duplicates',
                kind: 'select',
                options: [
                    { value: 'keep', label: 'Keep' },
                    { value: 'remove', label: 'Remove' },
                ],
                defaultValue: 'keep',
            },
        ],
        actions: [{ id: 'convert', label: 'Convert' }],
        run: (_action, values) => ({
            output: convertList(values.input ?? '', {
                format: values.format || 'comma',
                quote: values.quote || 'none',
                sort: values.sort || 'none',
                unique: values.unique === 'remove',
                trim: true,
                skipEmpty: true,
            }),
        }),
    },
    {
        id: 'mock-data',
        label: 'Mock Data Generator',
        description: 'Generate fake rows as JSON, CSV, SQL, or YAML',
        command: 'devx.mockDataTool',
        icon: 'mock.svg',
        defaultVisible: true,
        category: 'Data',
        summary: `Describe fields as name:type, one per line or comma separated. Types: ${MOCK_TYPES.join(', ')}. Ranges: int(1|100), date(2024-01-01|2024-12-31), enum(a|b|c). Values are fictional.`,
        fields: [
            {
                id: 'schema',
                label: 'Schema',
                kind: 'textarea',
                rows: 6,
                placeholder: 'id:id\nname:name\nemail:email\nage:int(18|90)\nactive:bool\nrole:enum(admin|user|guest)',
            },
            { id: 'count', label: 'Rows', kind: 'number', defaultValue: '10' },
            {
                id: 'format',
                label: 'Format',
                kind: 'select',
                options: [
                    { value: 'json', label: 'JSON' },
                    { value: 'ndjson', label: 'NDJSON' },
                    { value: 'csv', label: 'CSV' },
                    { value: 'sql', label: 'SQL INSERT' },
                    { value: 'yaml', label: 'YAML' },
                ],
                defaultValue: 'json',
            },
        ],
        actions: [{ id: 'generate', label: 'Generate' }],
        run: (_action, values) => ({
            output: generateMockData(
                values.schema || 'id:id\nname:name\nemail:email',
                readInteger(values.count, 'Rows', 1, 1000),
                values.format || 'json',
            ),
        }),
    },
];
