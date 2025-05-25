import { App, Plugin, EventRef } from "obsidian";

export type ObsidianEvents = {
    'ai-providers-ready': () => void;
};

export type AIProviderType = 'openai' | 'ollama' | 'gemini' | 'openrouter' | 'lmstudio' | 'groq' | 'custom';
export interface IAIProvider {
    id: string;
    name: string;
    apiKey?: string;
    url?: string;
    type: AIProviderType;
    model?: string;
    availableModels?: string[];
    userDefinedCapabilities?: AICapability[];
}

export interface IChunkHandler {
    onData(callback: (chunk: string, accumulatedText: string) => void): void;
    onEnd(callback: (fullText: string) => void): void;
    onError(callback: (error: Error) => void): void;
    abort(): void;
}

export interface IAIProvidersService {
    version: number;
    providers: IAIProvider[];
    fetchModels: (provider: IAIProvider) => Promise<string[]>;
    embed: (params: IAIProvidersEmbedParams) => Promise<number[][]>;
    execute: (params: IAIProvidersExecuteParams) => Promise<IChunkHandler>;
    checkCompatibility: (requiredVersion: number) => void;
    migrateProvider: (provider: IAIProvider) => Promise<IAIProvider | false>;
    getLastRequestMetrics(providerId: string): IUsageMetrics | null;
    detectCapabilities(params: IAIProvidersExecuteParams, providerType?: AIProviderType): AICapability[];
    getModelCapabilities(provider: IAIProvider): AICapability[];
    detectModelCapabilities(provider: IAIProvider): Promise<AICapability[]>;
}

export interface ITokenUsage {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
}

export type AICapability = 'dialogue' | 'vision' | 'tool_use' | 'text_to_image' | 'embedding';

export interface IModelCapabilities {
    modelId: string;
    capabilities: AICapability[];
}

export interface IContentBlockText {
    type: 'text';
    text: string;
}

export interface IContentBlockImageUrl {
    type: 'image_url';
    image_url: {
        url: string;
    };
}

export type IContentBlock = IContentBlockText | IContentBlockImageUrl;

export interface IChatMessage {
    role: string;
    content: string | IContentBlock[];
    images?: string[];
}

export interface IAIProvidersExecuteParamsBase {
    provider: IAIProvider;
    images?: string[];
    options?: {
        temperature?: number;
        max_tokens?: number;
        top_p?: number;
        frequency_penalty?: number;
        presence_penalty?: number;
        stop?: string[];
        [key: string]: any;
    };
}

export type IAIProvidersExecuteParamsWithPrompt = IAIProvidersExecuteParamsBase & {
    messages?: never;
    prompt: string;
    systemPrompt?: string;
};

export type IAIProvidersExecuteParamsWithMessages = IAIProvidersExecuteParamsBase & {
    messages: IChatMessage[];
    prompt?: never;
    systemPrompt?: never;
};

export type IAIProvidersExecuteParams = IAIProvidersExecuteParamsWithPrompt | IAIProvidersExecuteParamsWithMessages;

export interface IAIProvidersEmbedParams {
    input?: string | string[];
    text?: string | string[];
    provider: IAIProvider;
}

export interface IUsageMetrics {
    usage: ITokenUsage;
    durationMs: number;
    firstTokenLatencyMs?: number;
    promptEvalDurationMs?: number;
    evalDurationMs?: number;
    loadDurationMs?: number;
}

export type ReportUsageCallback = (metrics: IUsageMetrics) => void;

export interface IAIHandler {
    fetchModels(provider: IAIProvider): Promise<string[]>;
    embed(params: IAIProvidersEmbedParams): Promise<number[][]>;
    execute(params: IAIProvidersExecuteParams, reportUsage?: ReportUsageCallback): Promise<IChunkHandler>;
}

export interface IAIProvidersPluginSettings {
    providers?: IAIProvider[];
    _version: number;
    debugLogging?: boolean;
    useNativeFetch?: boolean;
}

export interface ExtendedApp extends App { 
    aiProviders?: IAIProvidersService;
    plugins?: {
        enablePlugin: (id: string) => Promise<void>;
        disablePlugin: (id: string) => Promise<void>;
    };
    workspace: App['workspace'] & {
        on: <K extends keyof ObsidianEvents>(event: K, callback: ObsidianEvents[K]) => EventRef;
        off: <K extends keyof ObsidianEvents>(event: K, callback: ObsidianEvents[K]) => void;
    };
}

export declare function waitForAIProviders(app: ExtendedApp, plugin: Plugin): Promise<{
    promise: Promise<IAIProvidersService>;
    cancel: () => void;
}>;

export declare function initAI(app: ExtendedApp, plugin: Plugin, onDone: () => Promise<void>): Promise<void>;

export declare function waitForAI(): Promise<{
    promise: Promise<IAIProvidersService>;
    cancel: () => void;
}>; 