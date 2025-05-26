export const enum Providers {
	OLLAMA = "ollama",
	OPENAI_COMPATIBLE = "openaiCompatible",
	OLLAMA_FALLBACK = "ollama_fallback",
	OPENAI_COMPATIBLE_FALLBACK = "openaiCompatible_fallback",
}

export type OllamaProvider = {
	url: string;
	defaultModel: string;
	embeddingModel: string;
	type: "ollama";
};

export type OpenAICompatibleProvider = {
	url: string;
	apiKey?: string;
	defaultModel?: string;
	embeddingModel?: string;
	type: "openaiCompatible";
};

export type Provider = OllamaProvider | OpenAICompatibleProvider;

export type ProvidersConfig = {
	[key: string]: Provider;
};

export interface LocalGPTSettings {
	aiProviders: {
		main: string | null;
		embedding: string | null;
		vision: string | null;
	};
	defaults: {
		creativity: string;
		showModelInfo: boolean;
		showPerformance: boolean;
	};
	tags: {
		cacheEnabled: boolean;   // 是否启用标签缓存
		lastCacheUpdate: number; // 上次缓存更新时间戳
		cacheUpdateInterval: number; // 缓存更新间隔（毫秒）
		excludeFolders: string[]; // 排除的文件夹路径
	};
	actions: LocalGPTAction[];
	_version: number;
}

export interface LocalGPTAction {
	name: string;
	prompt: string;
	temperature?: number;
	system?: string;
	replace?: boolean;
}

export type AIProviderProcessingOptions = {
	text: string;
	context: string;
	action: LocalGPTAction;
	images: string[];
	options: {
		temperature: number;
	};
};

export interface AIProvider {
	abortController?: AbortController;
	getEmbeddings(
		texts: string[],
		updateProgress: (progress: number) => void,
	): Promise<number[][]>;
	process(arg: AIProviderProcessingOptions): Promise<string>;
}

// 标签统计信息接口
export interface TagStats {
	[tagName: string]: number; // 标签名称 -> 引用次数
}
