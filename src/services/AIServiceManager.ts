/**
 * AI 服务管理器
 * 封装所有与 AI Provider 的交互逻辑
 */

import {
    IAIProvider,
    IAIProvidersService,
    AICapability,
    IAIProvidersExecuteParams,
    IUsageMetrics,
    waitForAI
} from "@obsidian-ai-providers/sdk";
import { App, Notice, TFile } from "obsidian";
import { LocalGPTSettings } from "../interfaces";
import { preparePrompt } from "../utils";
import { CREATIVITY } from "../defaultSettings";

export interface TokenData {
    inputTokens: number | string;
    outputTokens: number | string;
    totalTokens: number | string;
    generationSpeed?: number | string;
    promptEvalDuration?: number | string;
    evalDuration?: number | string;
    loadDuration?: number | string;
    firstTokenLatency?: number;
}

export interface AIRequestOptions {
    prompt: string;
    systemPrompt?: string;
    images?: string[];
    temperature?: number;
    selectedText: string;
    context: string;
}

export interface PerformanceMetrics {
    requestStartTime: number;
    firstChunkTime: number | null;
    tokenData: TokenData;
}

export class AIServiceManager {
    private aiProvidersService: IAIProvidersService | null = null;
    private initialized: boolean = false;

    constructor(
        private app: App,
        private settings: LocalGPTSettings
    ) {}

    /**
     * 初始化 AI 服务
     */
    async initialize(): Promise<void> {
        if (this.initialized && this.aiProvidersService) {
            return;
        }

        const aiRequestWaiter = await waitForAI();
        this.aiProvidersService = await aiRequestWaiter.promise;
        this.initialized = true;
    }

    /**
     * 获取 AI Providers 服务
     */
    async getAIProviders(): Promise<IAIProvidersService> {
        if (!this.initialized || !this.aiProvidersService) {
            await this.initialize();
        }
        
        if (!this.aiProvidersService) {
            throw new Error("Failed to initialize AI Providers Service");
        }
        
        return this.aiProvidersService;
    }

    /**
     * 获取合适的 Provider
     */
    async getProvider(requiresVision: boolean = false): Promise<{
        provider: IAIProvider;
        displayName: string;
    }> {
        const aiProviders = await this.getAIProviders();
        
        let provider: IAIProvider | undefined;
        
        if (requiresVision) {
            // 需要视觉功能时，优先使用配置的视觉模型
            provider = aiProviders.providers.find(
                (p: IAIProvider) => p.id === this.settings.aiProviders.vision
            );
            
            // 如果没有配置视觉模型，尝试找一个支持视觉的模型
            if (!provider) {
                provider = aiProviders.providers.find((p: IAIProvider) => {
                    const capabilities = aiProviders.getModelCapabilities(p);
                    return capabilities.includes('vision');
                });
            }
            
            if (!provider) {
                throw new Error("未配置视觉模型进行图像处理。");
            }
        } else {
            // 不需要视觉功能时，使用主模型
            provider = aiProviders.providers.find(
                (p: IAIProvider) => p.id === this.settings.aiProviders.main
            );
        }
        
        if (!provider) {
            throw new Error("未找到AI提供商。请在设置中配置提供商。");
        }
        
        const displayName = `${provider.name}${
            provider.model ? ` (${provider.model})` : ""
        }`;
        
        return { provider, displayName };
    }

    /**
     * 处理视觉模型切换
     */
    async handleVisionProvider(imagesInBase64: string[]): Promise<{
        provider: IAIProvider;
        displayName: string;
        modelCapabilities: AICapability[];
    }> {
        const aiProviders = await this.getAIProviders();
        const requiresVision = imagesInBase64.length > 0;
        
        const { provider, displayName } = await this.getProvider(requiresVision);
        
        // 如果有图片但当前模型不支持视觉，给出提示
        if (requiresVision) {
            const capabilities = aiProviders.getModelCapabilities(provider);
            if (!capabilities.includes('vision')) {
                new Notice(
                    `警告：当前模型 ${provider.name} 可能不支持图像处理。`
                );
            } else {
                new Notice(
                    `已切换到支持视觉的模型: ${provider.name} 处理图像。`
                );
            }
        }
        
        const modelCapabilities = aiProviders.getModelCapabilities(provider);
        console.log("模型能力:", modelCapabilities);
        
        return { provider, displayName, modelCapabilities };
    }

    /**
     * 监控性能指标（Ollama 专用）
     */
    async monitorPerformance(
        provider: IAIProvider,
        tokenData: TokenData
    ): Promise<TokenData> {
        if (provider.type !== 'ollama') {
            return tokenData;
        }

        const aiProviders = await this.getAIProviders();
        
        // 等待一小段时间，确保请求已经完成
        await new Promise(resolve => setTimeout(resolve, 100));
        
        try {
            // 检查getLastRequestMetrics方法是否存在
            if (typeof aiProviders.getLastRequestMetrics === 'function') {
                console.log("找到getLastRequestMetrics方法，SDK版本兼容");
                
                const metrics = aiProviders.getLastRequestMetrics(provider.id);
                
                if (metrics) {
                    console.log("从SDK获取性能数据:", metrics);
                    
                    // 提取token数据
                    tokenData.inputTokens = metrics.usage?.promptTokens || 0;
                    tokenData.outputTokens = metrics.usage?.completionTokens || 0;
                    tokenData.totalTokens = metrics.usage?.totalTokens || 0;
                    
                    // 提取性能指标数据
                    if (metrics.promptEvalDurationMs !== undefined) {
                        tokenData.promptEvalDuration = metrics.promptEvalDurationMs || 0;
                    }
                    
                    if (metrics.evalDurationMs !== undefined) {
                        tokenData.evalDuration = metrics.evalDurationMs || 0;
                    }
                    
                    if (metrics.loadDurationMs !== undefined) {
                        tokenData.loadDuration = metrics.loadDurationMs || 0;
                    }
                    
                    if (metrics.firstTokenLatencyMs !== undefined) {
                        tokenData.firstTokenLatency = metrics.firstTokenLatencyMs;
                    }
                    
                    // 计算生成速率（tokens/秒）
                    if (metrics.usage?.completionTokens && metrics.durationMs) {
                        tokenData.generationSpeed = Math.round(
                            (metrics.usage.completionTokens * 1000) / metrics.durationMs
                        );
                    }
                    
                    console.log("成功处理性能指标:", tokenData);
                } else {
                    console.log("SDK未返回性能指标数据，将使用智能估算");
                }
            } else {
                console.log("getLastRequestMetrics方法不存在，AI Providers插件版本可能低于1.4.0");
                console.log("AI Providers可用方法:", Object.getOwnPropertyNames(aiProviders));
            }
        } catch (e) {
            console.error("获取性能指标时出错:", e);
        }
        
        return tokenData;
    }

    /**
     * 准备执行参数
     */
    async prepareExecuteParams(
        provider: IAIProvider,
        options: AIRequestOptions,
        activeFile: TFile | null,
        excludeFolders: string[]
    ): Promise<IAIProvidersExecuteParams> {
        const preparedPrompt = await preparePrompt(
            options.prompt,
            options.selectedText,
            options.context,
            this.app,
            activeFile,
            excludeFolders
        );

        const preparedSystemPrompt = options.systemPrompt
            ? (await preparePrompt(
                  options.systemPrompt,
                  "",
                  "",
                  this.app,
                  activeFile,
                  excludeFolders
              )).prompt
            : undefined;

        return {
            provider,
            prompt: preparedPrompt.prompt,
            images: options.images,
            systemPrompt: preparedSystemPrompt,
            options: {
                temperature:
                    options.temperature ||
                    CREATIVITY[this.settings.defaults.creativity].temperature,
            },
        };
    }

    /**
     * 执行 AI 请求
     */
    async execute(params: IAIProvidersExecuteParams): Promise<any> {
        const aiProviders = await this.getAIProviders();
        return aiProviders.execute(params);
    }

    /**
     * 获取模型能力
     */
    async getModelCapabilities(provider: IAIProvider): Promise<AICapability[]> {
        const aiProviders = await this.getAIProviders();
        return aiProviders.getModelCapabilities(provider);
    }

    /**
     * 获取嵌入模型 Provider
     */
    async getEmbeddingProvider(): Promise<IAIProvider | undefined> {
        const aiProviders = await this.getAIProviders();
        return aiProviders.providers.find(
            (provider: IAIProvider) =>
                provider.id === this.settings.aiProviders.embedding
        );
    }
} 