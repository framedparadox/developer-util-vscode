import { GraphEdge, GraphNode, GraphNodeType, GraphRow, GraphValueType, VisualizerNode, NodeType } from './types';

interface GraphBuildState {
    nextNodeId: number;
    nextEdgeId: number;
    nodes: GraphNode[];
    edges: GraphEdge[];
    maxDepth: number;
}

interface GraphBuildResult {
    nodes: GraphNode[];
    edges: GraphEdge[];
    totalNodes: number;
    maxDepth: number;
}

/**
 * Transforms parsed JSON data into a hierarchical VisualizerNode structure
 */
export class DataTransformer {
    /**
     * Convert parsed data into card-style graph nodes and labeled edges.
     */
    static jsonToGraph(data: unknown): GraphBuildResult {
        const state: GraphBuildState = {
            nextNodeId: 1,
            nextEdgeId: 1,
            nodes: [],
            edges: [],
            maxDepth: 0,
        };

        this.buildGraphNode(data, 'Root', '$', 0, state);

        return {
            nodes: state.nodes,
            edges: state.edges,
            totalNodes: state.nodes.length,
            maxDepth: state.maxDepth,
        };
    }

    /**
     * Convert any JSON-compatible object to VisualizerNode tree
     */
    static jsonToNodes(obj: any, key: string = 'Root', path: string = '$', depth: number = 0): VisualizerNode {
        const nodeType = this.identifyNodeType(obj);
        const id = path === '$' ? 'root' : path;

        if (nodeType === 'object') {
            const keys = Object.keys(obj);
            const label =
                key === 'Root'
                    ? `Root Object (${keys.length} ${keys.length === 1 ? 'property' : 'properties'})`
                    : `${key} (${keys.length} ${keys.length === 1 ? 'prop' : 'props'})`;

            return {
                id,
                label,
                type: 'object',
                children: keys.map((k) => this.jsonToNodes(obj[k], k, `${path}.${k}`, depth + 1)),
                metadata: {
                    depth,
                    dataType: 'object',
                    isCollapsed: depth > 2, // Auto-collapse deep nodes
                    path,
                },
            };
        }

        if (nodeType === 'array') {
            const label = `${key} [${obj.length} ${obj.length === 1 ? 'item' : 'items'}]`;

            return {
                id,
                label,
                type: 'array',
                children: obj.map((item: any, idx: number) =>
                    this.jsonToNodes(item, `[${idx}]`, `${path}[${idx}]`, depth + 1)
                ),
                metadata: {
                    depth,
                    dataType: 'array',
                    isCollapsed: depth > 2,
                    path,
                },
            };
        }

        // Primitive value (leaf node)
        const displayValue = this.formatValue(obj);
        const label = depth === 0 ? displayValue : `${key}: ${displayValue}`;

        return {
            id,
            label,
            type: 'property',
            value: obj,
            metadata: {
                depth,
                dataType: obj === null ? 'null' : typeof obj,
                isCollapsed: false,
                path,
            },
        };
    }

    /**
     * Identify the type of a value
     */
    private static identifyNodeType(value: any): NodeType {
        if (Array.isArray(value)) {
            return 'array';
        }
        if (value === null) {
            return 'property';
        }
        if (typeof value === 'object') {
            return 'object';
        }
        return 'property'; // primitives: string, number, boolean
    }

    /**
     * Format a primitive value for display
     */
    private static formatValue(value: any): string {
        if (value === null) {
            return 'null';
        }
        if (value === undefined) {
            return 'undefined';
        }
        if (typeof value === 'string') {
            // Truncate long strings
            if (value.length > 50) {
                return `"${value.substring(0, 47)}..."`;
            }
            return `"${value}"`;
        }
        if (typeof value === 'boolean') {
            return value.toString();
        }
        if (typeof value === 'number') {
            return value.toString();
        }
        return String(value);
    }

    /**
     * Calculate total number of nodes in tree
     */
    static countNodes(node: VisualizerNode): number {
        let count = 1; // Count this node
        if (node.children) {
            count += node.children.reduce((sum, child) => sum + this.countNodes(child), 0);
        }
        return count;
    }

    /**
     * Calculate maximum depth of tree
     */
    static calculateMaxDepth(node: VisualizerNode): number {
        if (!node.children || node.children.length === 0) {
            return node.metadata.depth;
        }
        // Use reduce instead of spreading into Math.max: spreading a large
        // children array can overflow the call stack on wide trees.
        return node.children.reduce((max, child) => Math.max(max, this.calculateMaxDepth(child)), node.metadata.depth);
    }

    private static buildGraphNode(
        value: unknown,
        key: string,
        path: string,
        depth: number,
        state: GraphBuildState
    ): string {
        const id = `node-${state.nextNodeId++}`;
        const nodeType = this.identifyGraphNodeType(value);
        const childEntries = this.getChildEntries(value);
        const rows: GraphRow[] = [];

        state.maxDepth = Math.max(state.maxDepth, depth);

        if (nodeType === 'value') {
            rows.push({
                key: null,
                value: this.formatGraphValue(value),
                valueType: this.identifyGraphValueType(value),
                isReference: false,
            });
        } else if (childEntries.length === 0) {
            rows.push({
                key: null,
                value: nodeType === 'array' ? '[0 items]' : '{0 keys}',
                valueType: nodeType,
                isReference: false,
                childrenCount: 0,
            });
        } else {
            for (const child of childEntries) {
                const childValueType = this.identifyGraphValueType(child.value);
                if (childValueType === 'object' || childValueType === 'array') {
                    const childPath = this.joinPath(path, child.pathSegment);
                    const childNodeId = this.buildGraphNode(child.value, child.key, childPath, depth + 1, state);
                    const childCount = this.getChildEntries(child.value).length;

                    rows.push({
                        key: child.key,
                        value: childValueType === 'array' ? `[${childCount} ${childCount === 1 ? 'item' : 'items'}]` : `{${childCount} ${childCount === 1 ? 'key' : 'keys'}}`,
                        valueType: childValueType,
                        isReference: true,
                        childrenCount: childCount,
                        targetIds: [childNodeId],
                    });
                    state.edges.push({
                        id: `edge-${state.nextEdgeId++}`,
                        from: id,
                        to: childNodeId,
                        label: child.key,
                    });
                } else if (nodeType === 'array') {
                    const childPath = this.joinPath(path, child.pathSegment);
                    const childNodeId = this.buildGraphNode(child.value, child.key, childPath, depth + 1, state);
                    rows.push({
                        key: child.key,
                        value: this.formatGraphValue(child.value),
                        valueType: childValueType,
                        isReference: true,
                        targetIds: [childNodeId],
                    });
                    state.edges.push({
                        id: `edge-${state.nextEdgeId++}`,
                        from: id,
                        to: childNodeId,
                        label: child.key,
                    });
                } else {
                    rows.push({
                        key: child.key,
                        value: this.formatGraphValue(child.value),
                        valueType: childValueType,
                        isReference: false,
                    });
                }
            }
        }

        const dimensions = this.calculateGraphNodeSize(this.formatGraphTitle(key, value, nodeType), rows);
        state.nodes.push({
            id,
            title: this.formatGraphTitle(key, value, nodeType),
            type: nodeType,
            rows,
            path,
            depth,
            childCount: childEntries.length,
            width: dimensions.width,
            height: dimensions.height,
            collapsed: false,
        });

        return id;
    }

    private static getChildEntries(value: unknown): Array<{ key: string; pathSegment: string; value: unknown }> {
        if (Array.isArray(value)) {
            return value.map((item, index) => ({
                key: `[${index}]`,
                pathSegment: `[${index}]`,
                value: item,
            }));
        }

        if (value !== null && typeof value === 'object') {
            return Object.keys(value as Record<string, unknown>).map((key) => ({
                key,
                pathSegment: key,
                value: (value as Record<string, unknown>)[key],
            }));
        }

        return [];
    }

    private static identifyGraphNodeType(value: unknown): GraphNodeType {
        if (Array.isArray(value)) {
            return 'array';
        }
        if (value !== null && typeof value === 'object') {
            return 'object';
        }
        return 'value';
    }

    private static identifyGraphValueType(value: unknown): GraphValueType {
        if (Array.isArray(value)) {
            return 'array';
        }
        if (value === null) {
            return 'null';
        }
        if (typeof value === 'object') {
            return 'object';
        }
        if (typeof value === 'string') {
            return 'string';
        }
        if (typeof value === 'number') {
            return 'number';
        }
        if (typeof value === 'boolean') {
            return 'boolean';
        }
        return 'unknown';
    }

    private static formatGraphTitle(key: string, value: unknown, nodeType: GraphNodeType): string {
        if (nodeType === 'value') {
            return key === 'Root' ? 'Root Value' : key;
        }

        const childCount = this.getChildEntries(value).length;
        if (key === 'Root') {
            return nodeType === 'array'
                ? `Root Array [${childCount} ${childCount === 1 ? 'item' : 'items'}]`
                : `Root Object {${childCount} ${childCount === 1 ? 'key' : 'keys'}}`;
        }

        return nodeType === 'array'
            ? `${key} [${childCount} ${childCount === 1 ? 'item' : 'items'}]`
            : `${key} {${childCount} ${childCount === 1 ? 'key' : 'keys'}}`;
    }

    private static formatGraphValue(value: unknown): string {
        if (value === null) {
            return 'null';
        }
        if (typeof value === 'string') {
            return value.length > 80 ? `"${value.slice(0, 77)}..."` : `"${value}"`;
        }
        if (typeof value === 'undefined') {
            return 'undefined';
        }
        return String(value);
    }

    private static calculateGraphNodeSize(title: string, rows: GraphRow[]): { width: number; height: number } {
        const rowTextLengths = rows.map((row) => `${row.key ?? ''}${row.value}`.length);
        const longestText = Math.max(title.length, ...rowTextLengths, 12);
        const width = Math.max(190, Math.min(380, longestText * 7 + 58));
        const height = 42 + Math.max(rows.length, 1) * 28 + 18;
        return { width, height };
    }

    private static joinPath(path: string, segment: string): string {
        if (segment.startsWith('[')) {
            return `${path}${segment}`;
        }

        if (/^[A-Za-z_$][\w$]*$/.test(segment)) {
            return `${path}.${segment}`;
        }

        return `${path}[${JSON.stringify(segment)}]`;
    }
}
