/**
 * 动作执行器
 * 负责执行 AI 动作的核心逻辑
 */

import { Editor, Notice, TFile } from "obsidian";
import { LocalGPTAction, LocalGPTSettings } from "../interfaces";
import { AIServiceManager, TokenData } from "../services";
import { 
    processGeneratedText,
    removeThinkingTags,
    extractImageLinks,
    estimateTokenUsage,
    getCapabilityIcons,
    preparePrompt,
    logger
} from "../utils/index";
import { spinnerPlugin } from "../spinnerPlugin";

export interface IActionExecutorHost {
    app: any;
    settings: LocalGPTSettings;
    aiServiceManager: AIServiceManager;
    abortControllers: AbortController[];
    processText(text: string, selectedText: string): string;
    enhanceWithContext(
        selectedText: string,
        aiProviders: any,
        aiProvider: any,
        abortController: AbortController
    ): Promise<string>;
}

export interface ActionExecutionOptions {
    action: LocalGPTAction;
    editor: Editor;
    onProgress?: (steps: number) => void;
    onComplete?: (steps: number) => void;
}

export class ActionExecutor {
    constructor(private host: IActionExecutorHost) {}

    /**
     * 执行指定的 AI 动作
     */
    async executeAction(options: ActionExecutionOptions): Promise<void> {
        const { action, editor } = options;
        
        // @ts-expect-error, not typed
        const editorView = editor.cm;

        // 获取选中的文本，如果没有选中则使用整个文档
        const selection = editor.getSelection();
        let selectedText = selection || editor.getValue();
        const cursorPositionFrom = editor.getCursor("from");
        const cursorPositionTo = editor.getCursor("to");

        // 创建中止控制器
        const abortController = new AbortController();
        this.host.abortControllers.push(abortController);

        // 显示加载动画
        const spinner = editorView.plugin(spinnerPlugin) || undefined;
        const hideSpinner = spinner?.show(editor.posToOffset(cursorPositionTo));
        this.host.app.workspace.updateOptions();

        // 实时更新处理进度的回调函数
        const onUpdate = (updatedString: string) => {
            spinner.processText(updatedString, (text: string) =>
                this.host.processText(text, selectedText),
            );
            this.host.app.workspace.updateOptions();
        };

        try {
            // 提取并处理图片
            const { fileNames, cleanedText } = extractImageLinks(selectedText);
            selectedText = cleanedText;

            // 将图片转换为 Base64
            const imagesInBase64 = await this.convertImagesToBase64(fileNames);

            // 日志记录
            logger.time("Processing Embeddings");
            logger.timeEnd("Processing Embeddings");
            logger.debug("Selected text", selectedText);

            // 获取增强的上下文
            const context = await this.getEnhancedContext(selectedText, abortController);

            // 处理视觉模型切换并获取 Provider
            const { provider, displayName: modelDisplayName, modelCapabilities } = 
                await this.host.aiServiceManager.handleVisionProvider(imagesInBase64);

            // 性能指标初始化
            const requestStartTime = performance.now();
            let firstChunkTime: number | null = null;
            let tokenData: TokenData = {
                inputTokens: "?",
                outputTokens: "?",
                totalTokens: "?"
            };

            // 准备执行参数
            const executeParams = await this.host.aiServiceManager.prepareExecuteParams(
                provider,
                {
                    prompt: action.prompt,
                    systemPrompt: action.system,
                    images: imagesInBase64,
                    temperature: action.temperature,
                    selectedText,
                    context
                },
                this.host.app.workspace.getActiveFile(),
                this.host.settings.tags.excludeFolders
            );

            // 获取显示控制参数
            const { showModelInfo, showPerformance } = await this.getDisplayOptions(action);

            // 执行 AI 请求
            const chunkHandler = await this.host.aiServiceManager.execute(executeParams);

            // 处理数据流
            chunkHandler.onData((chunk: string, accumulatedText: string) => {
                if (firstChunkTime === null) {
                    firstChunkTime = performance.now();
                    tokenData.firstTokenLatency = Math.round(firstChunkTime - requestStartTime);
                    console.log("记录首字延迟:", tokenData.firstTokenLatency, "ms");
                }
                onUpdate(accumulatedText);
            });

            // 处理完成
            chunkHandler.onEnd(async (fullText: string) => {
                await this.handleCompletion({
                    fullText,
                    action,
                    editor,
                    provider,
                    modelDisplayName,
                    modelCapabilities,
                    tokenData,
                    requestStartTime,
                    firstChunkTime,
                    selectedText,
                    context,
                    showModelInfo,
                    showPerformance,
                    cursorPositionFrom,
                    cursorPositionTo,
                    hideSpinner
                });
            });

            // 处理错误
            chunkHandler.onError((error: Error) => {
                this.handleError(error, abortController, hideSpinner);
            });

            // 处理中止
            abortController.signal.addEventListener("abort", () => {
                console.log("make abort");
                chunkHandler.abort();
                hideSpinner && hideSpinner();
                this.host.app.workspace.updateOptions();
            });

        } catch (error) {
            this.handleError(error as Error, abortController, hideSpinner);
        }
    }

    /**
     * 将图片文件名转换为 Base64 编码
     */
    private async convertImagesToBase64(fileNames: string[]): Promise<string[]> {
        const results = await Promise.all<string>(
            fileNames.map((fileName) => {
                const filePath = this.host.app.metadataCache.getFirstLinkpathDest(
                    fileName,
                    // @ts-ignore
                    this.host.app.workspace.getActiveFile().path,
                );

                if (!filePath) {
                    return Promise.resolve("");
                }

                return this.host.app.vault.adapter
                    .readBinary(filePath.path)
                    .then((buffer: ArrayBuffer) => {
                        const extension = filePath.extension.toLowerCase();
                        const mimeType = extension === "jpg" ? "jpeg" : extension;
                        const blob = new Blob([buffer], {
                            type: `image/${mimeType}`,
                        });
                        return new Promise<string>((resolve) => {
                            const reader = new FileReader();
                            reader.onloadend = () =>
                                resolve(reader.result as string);
                            reader.readAsDataURL(blob);
                        });
                    });
            }),
        );
        
        return results.filter(Boolean) || [];
    }

    /**
     * 获取增强的上下文
     */
    private async getEnhancedContext(
        selectedText: string,
        abortController: AbortController
    ): Promise<string> {
        const embeddingProvider = await this.host.aiServiceManager.getEmbeddingProvider();
        
        return await this.host.enhanceWithContext(
            selectedText,
            await this.host.aiServiceManager.getAIProviders(),
            embeddingProvider,
            abortController,
        );
    }

    /**
     * 获取显示控制选项
     */
    private async getDisplayOptions(action: LocalGPTAction): Promise<{
        showModelInfo: boolean;
        showPerformance: boolean;
    }> {
        const promptOptions = await preparePrompt(
            action.prompt, 
            "", 
            "", 
            this.host.app,
            this.host.app.workspace.getActiveFile(),
            this.host.settings.tags.excludeFolders
        );
        
        const systemOptions = action.system ? 
            await preparePrompt(
                action.system, 
                "", 
                "", 
                this.host.app,
                this.host.app.workspace.getActiveFile(),
                this.host.settings.tags.excludeFolders
            ) : 
            { showModelInfo: undefined, showPerformance: undefined };
        
        const showModelInfo = 
            systemOptions.showModelInfo !== undefined ? systemOptions.showModelInfo : 
            promptOptions.showModelInfo !== undefined ? promptOptions.showModelInfo : 
            this.host.settings.defaults.showModelInfo;
            
        const showPerformance = 
            systemOptions.showPerformance !== undefined ? systemOptions.showPerformance : 
            promptOptions.showPerformance !== undefined ? promptOptions.showPerformance : 
            this.host.settings.defaults.showPerformance;
            
        return { showModelInfo, showPerformance };
    }

    /**
     * 处理 AI 响应完成
     */
    private async handleCompletion(params: {
        fullText: string;
        action: LocalGPTAction;
        editor: Editor;
        provider: any;
        modelDisplayName: string;
        modelCapabilities: any[];
        tokenData: TokenData;
        requestStartTime: number;
        firstChunkTime: number | null;
        selectedText: string;
        context: string;
        showModelInfo: boolean;
        showPerformance: boolean;
        cursorPositionFrom: any;
        cursorPositionTo: any;
        hideSpinner: any;
    }): Promise<void> {
        const {
            fullText,
            action,
            editor,
            provider,
            modelDisplayName,
            modelCapabilities,
            tokenData: initialTokenData,
            requestStartTime,
            firstChunkTime,
            selectedText,
            context,
            showModelInfo,
            showPerformance,
            cursorPositionFrom,
            cursorPositionTo,
            hideSpinner
        } = params;

        // 监控性能指标
        let tokenData = await this.host.aiServiceManager.monitorPerformance(provider, initialTokenData);
        
        hideSpinner && hideSpinner();
        this.host.app.workspace.updateOptions();

        // 计算性能指标
        const requestEndTime = performance.now();
        const totalTime = Math.round(requestEndTime - requestStartTime);
        const ttft = tokenData.firstTokenLatency || 
            (firstChunkTime ? Math.round(firstChunkTime - requestStartTime) : "N/A");
        
        // 估算 Token 使用（如果需要）
        if (tokenData.totalTokens === "?") {
            console.log("实时token数据不可用，使用智能估算");
            const estimatedTokens = await this.estimateTokenUsage(
                action,
                selectedText,
                context,
                fullText
            );
            tokenData.inputTokens = estimatedTokens.inputTokens;
            tokenData.outputTokens = estimatedTokens.outputTokens;
            tokenData.totalTokens = estimatedTokens.totalTokens;
        }
        
        // 计算生成速度
        if (!tokenData.generationSpeed && typeof tokenData.outputTokens === 'number' && totalTime > 0) {
            tokenData.generationSpeed = Math.round((tokenData.outputTokens * 1000) / totalTime);
        }
        
        // 格式化最终输出
        const finalText = this.formatOutput({
            fullText,
            modelDisplayName,
            modelCapabilities,
            showModelInfo,
            showPerformance,
            tokenData,
            ttft,
            totalTime,
            provider
        });

        // 插入或替换文本
        this.insertText({
            editor,
            finalText,
            selectedText,
            action,
            cursorPositionFrom,
            cursorPositionTo
        });
    }

    /**
     * 估算 Token 使用
     */
    private async estimateTokenUsage(
        action: LocalGPTAction,
        selectedText: string,
        context: string,
        fullText: string
    ): Promise<{ inputTokens: number; outputTokens: number; totalTokens: number }> {
        const prompt = (await preparePrompt(
            action.prompt, 
            selectedText, 
            context, 
            this.host.app, 
            this.host.app.workspace.getActiveFile(),
            this.host.settings.tags.excludeFolders
        )).prompt;
        
        const systemPrompt = action.system ? 
            (await preparePrompt(
                action.system, 
                "", 
                "", 
                this.host.app,
                this.host.app.workspace.getActiveFile(),
                this.host.settings.tags.excludeFolders
            )).prompt : 
            undefined;
            
        return estimateTokenUsage(prompt, fullText, systemPrompt);
    }

    /**
     * 格式化输出文本
     */
    private formatOutput(params: {
        fullText: string;
        modelDisplayName: string;
        modelCapabilities: any[];
        showModelInfo: boolean;
        showPerformance: boolean;
        tokenData: TokenData;
        ttft: number | string;
        totalTime: number;
        provider: any;
    }): string {
        const {
            fullText,
            modelDisplayName,
            modelCapabilities,
            showModelInfo,
            showPerformance,
            tokenData,
            ttft,
            totalTime,
            provider
        } = params;

        // 移除思考标签
        const cleanedFullText = removeThinkingTags(fullText).trim();

        // 生成时间戳
        const now = new Date();
        const timeStr = now.toLocaleString("zh-CN", {
            timeZone: "Asia/Shanghai",
            hour12: false,
        });
        
        // 生成模型能力图标
        const capabilityIcons = getCapabilityIcons(modelCapabilities);
        
        // 构建最终文本
        let finalText = showModelInfo 
            ? `[${modelDisplayName || "AI"} ${capabilityIcons} ${timeStr}]:\n---\n${cleanedFullText}`
            : cleanedFullText;

        // 附加性能指标
        if (showPerformance) {
            let performanceMetrics = `\n\n---\n[Toks: ${tokenData.totalTokens} ↑${tokenData.inputTokens} ↓${tokenData.outputTokens} ${tokenData.generationSpeed || "?"}toks/s | 首字: ${ttft}ms | 总耗时: ${totalTime}ms`;
            
            // Ollama 特有指标
            if (provider?.type === 'ollama' && (tokenData.promptEvalDuration || tokenData.evalDuration || tokenData.loadDuration)) {
                performanceMetrics += ` | `;
                if (tokenData.promptEvalDuration) {
                    performanceMetrics += `提示词: ${tokenData.promptEvalDuration}ms | `;
                }
                if (tokenData.evalDuration) {
                    performanceMetrics += `生成: ${tokenData.evalDuration}ms | `;
                }
                if (tokenData.loadDuration) {
                    performanceMetrics += `加载: ${tokenData.loadDuration}ms | `;
                }
                performanceMetrics = performanceMetrics.replace(/\|\s*$/, '');
            }
            
            performanceMetrics += `]:`;
            finalText += performanceMetrics;
        }

        return finalText;
    }

    /**
     * 插入或替换文本
     */
    private insertText(params: {
        editor: Editor;
        finalText: string;
        selectedText: string;
        action: LocalGPTAction;
        cursorPositionFrom: any;
        cursorPositionTo: any;
    }): void {
        const {
            editor,
            finalText,
            selectedText,
            action,
            cursorPositionFrom,
            cursorPositionTo
        } = params;

        if (action.replace) {
            // 替换选中文本
            editor.replaceRange(
                finalText,
                cursorPositionFrom,
                cursorPositionTo,
            );
        } else {
            // 在选中文本后插入
            const isLastLine = editor.lastLine() === cursorPositionTo.line;
            const formattedText = this.host.processText(finalText, selectedText);
            editor.replaceRange(
                isLastLine ? "\n" + formattedText : formattedText,
                {
                    ch: 0,
                    line: cursorPositionTo.line + 1,
                },
            );
        }
    }

    /**
     * 处理错误
     */
    private handleError(
        error: Error,
        abortController: AbortController,
        hideSpinner: any
    ): void {
        console.log("abort handled");
        if (!abortController.signal.aborted) {
            new Notice(`生成文本时出错: ${error.message}`);
        }
        hideSpinner && hideSpinner();
        this.host.app.workspace.updateOptions();
        logger.separator();
    }
} 