/**
 * Type definitions for Data Visualizer
 */

export type NodeType = 'object' | 'array' | 'property' | 'value';
export type ConversionFormat = 'json' | 'yaml' | 'xml' | 'csv' | 'raml';
export type GraphNodeType = 'object' | 'array' | 'value';
export type GraphValueType = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null' | 'unknown';

export interface GraphRow {
    key: string | null;
    value: string;
    valueType: GraphValueType;
    isReference: boolean;
    childrenCount?: number;
    targetIds?: string[];
}

export interface GraphNode {
    id: string;
    title: string;
    type: GraphNodeType;
    rows: GraphRow[];
    path: string;
    depth: number;
    childCount: number;
    width: number;
    height: number;
    collapsed: boolean;
}

export interface GraphEdge {
    id: string;
    from: string;
    to: string;
    label: string;
}

export interface VisualizerGraphMetadata {
    format: ConversionFormat;
    totalNodes: number;
    maxDepth: number;
    lineCount: number;
    sourceSize: number;
    parseTimeMs: number;
    renderLimit: number;
    exceededRenderLimit: boolean;
    fileName?: string;
}

export interface VisualizerGraphData {
    nodes: GraphNode[];
    edges: GraphEdge[];
    metadata: VisualizerGraphMetadata;
}

export interface VisualizerNode {
    id: string; // Unique identifier: "root", "fruits", "fruits[0]", "fruits[0].details"
    label: string; // Display text: "Root Object", "fruits [2 items]", "details (2 props)"
    type: NodeType;
    value?: any; // For leaf nodes: "Apple", 52, "#FF0000"
    children?: VisualizerNode[];
    metadata: {
        depth: number; // 0 for root, increments per level
        dataType: string; // 'object', 'array', 'string', 'number', etc.
        isCollapsed: boolean; // Toggle state for expand/collapse
        path: string; // JSONPath: "$.fruits[0].details.type"
    };
}

export interface VisualizerData {
    root: VisualizerNode;
    metadata: {
        format: ConversionFormat;
        totalNodes: number;
        maxDepth: number;
        fileName?: string;
    };
}

export interface Parser {
    parse(content: string): any; // Returns JSON-compatible object
}

export type LayoutOrientation = 'horizontal' | 'vertical';

export interface ViewSettings {
    orientation: LayoutOrientation;
    zoomLevel: number;
    autoCollapse: boolean;
    autoCollapseDepth: number;
}

/**
 * Data Converter Types
 */
export type OutputFormat = 'json' | 'xml' | 'yaml'; // Supports JSON, XML, and YAML output

export interface ConversionResult {
    success: boolean;
    output?: string;
    error?: string;
    metadata: {
        sourceFormat: ConversionFormat;
        targetFormat: OutputFormat;
        sourceSize: number;
        outputSize: number;
        conversionTime: number; // milliseconds
    };
}

export interface DataConverter {
    convert(content: string, sourceFormat: ConversionFormat, targetFormat: OutputFormat): ConversionResult;
}
