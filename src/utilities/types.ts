export type FieldKind = 'textarea' | 'text' | 'number' | 'select';

export interface UtilityOption {
    value: string;
    label: string;
}

export interface UtilityField {
    id: string;
    label: string;
    kind: FieldKind;
    options?: UtilityOption[];
    defaultValue?: string;
    placeholder?: string;
    rows?: number;
}

export interface UtilityAction {
    id: string;
    label: string;
}

export interface UtilityResult {
    output: string;
    notice?: string;
    previewHtml?: string;
}

export type UtilityPresentation = 'form' | 'keycode';

export interface UtilityTool {
    id: string;
    label: string;
    description: string;
    command: string;
    icon: string;
    defaultVisible: boolean;
    category: string;
    summary: string;
    fields: UtilityField[];
    actions: UtilityAction[];
    presentation?: UtilityPresentation;
    fileAction?: UtilityAction;
    inject?: Array<'vscodeVersion'>;
    run: (action: string, values: Record<string, string>) => UtilityResult | Promise<UtilityResult>;
}
