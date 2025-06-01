/**
 * 上下文增强器
 * 负责实现检索增强生成功能（RAG）
 */

import {
    Vault,
    MetadataCache,
    TFile,
    Notice
} from "obsidian";
import {
    getLinkedFiles,
    createVectorStore,
    queryVectorStore,
    startProcessing
} from "../rag";
import { 
    IAIProvider,
    IAIProvidersService
} from "@obsidian-ai-providers/sdk";

export interface IContextEnhancerHost {
    app: any;
    initializeProgress(): void;
    addTotalProgressSteps(steps: number): void;
    updateCompletedSteps(steps: number): void;
    hideStatusBar(): void;
}

export interface EnhanceOptions {
    selectedText: string;
    activeFile: TFile | null;
    aiProviders: IAIProvidersService;
    aiProvider: IAIProvider | undefined;
    abortController: AbortController;
}

export class ContextEnhancer {
    private vault: Vault;
    private metadataCache: MetadataCache;

    constructor(private host: IContextEnhancerHost) {
        this.vault = host.app.vault;
        this.metadataCache = host.app.metadataCache;
    }

    /**
     * 使用相关文档内容增强上下文
     * 通过向量存储和语义搜索找到相关内容
     */
    async enhanceWithContext(options: EnhanceOptions): Promise<string> {
        const {
            selectedText,
            activeFile,
            aiProviders,
            aiProvider,
            abortController
        } = options;

        // 验证先决条件
        if (!activeFile || !aiProvider) {
            return "";
        }

        // 获取选中文本中提到的链接文件
        const linkedFiles = getLinkedFiles(
            selectedText,
            this.vault,
            this.metadataCache,
            activeFile.path,
        );

        // 如果没有链接文件，返回空字符串
        if (linkedFiles.length === 0) {
            return "";
        }

        try {
            // 检查是否已取消操作
            if (abortController?.signal.aborted) {
                return "";
            }

            // 初始化进度条
            this.host.initializeProgress();

            // 处理链接的文档
            const processedDocs = await this.processLinkedDocuments(
                linkedFiles,
                activeFile,
                abortController
            );

            if (processedDocs.size === 0) {
                this.host.hideStatusBar();
                return "";
            }

            // 创建并查询向量存储
            const relevantContext = await this.createAndQueryVectorStore(
                processedDocs,
                selectedText,
                activeFile.path,
                aiProvider,
                aiProviders,
                abortController
            );

            this.host.hideStatusBar();

            if (relevantContext.trim()) {
                return relevantContext;
            }
        } catch (error) {
            this.handleError(error as Error, abortController);
        }

        return "";
    }

    /**
     * 处理链接的文档
     */
    private async processLinkedDocuments(
        linkedFiles: TFile[],
        activeFile: TFile,
        abortController: AbortController
    ): Promise<Map<string, any>> {
        if (abortController?.signal.aborted) {
            return new Map();
        }

        const processedDocs = await startProcessing(
            linkedFiles,
            this.vault,
            this.metadataCache,
            activeFile,
        );

        return processedDocs;
    }

    /**
     * 创建向量存储并查询相关内容
     */
    private async createAndQueryVectorStore(
        processedDocs: Map<string, any>,
        selectedText: string,
        activeFilePath: string,
        aiProvider: IAIProvider,
        aiProviders: IAIProvidersService,
        abortController: AbortController
    ): Promise<string> {
        if (abortController?.signal.aborted) {
            this.host.hideStatusBar();
            return "";
        }

        // 创建向量存储以进行语义搜索
        const vectorStore = await createVectorStore(
            Array.from(processedDocs.values()),
            this.host as any,
            activeFilePath,
            aiProvider as any,
            aiProviders,
            abortController,
            this.host.addTotalProgressSteps.bind(this.host),
            this.host.updateCompletedSteps.bind(this.host),
        );

        if (abortController?.signal.aborted) {
            this.host.hideStatusBar();
            return "";
        }

        // 查询向量存储获取相关上下文
        const relevantContext = await queryVectorStore(
            selectedText,
            vectorStore,
        );

        return relevantContext;
    }

    /**
     * 处理错误
     */
    private handleError(error: Error, abortController: AbortController): void {
        this.host.hideStatusBar();
        
        if (abortController?.signal.aborted) {
            return;
        }

        console.error("Error processing RAG:", error);
        new Notice(
            `Error processing related documents: ${error.message}. Continuing with original text.`,
        );
    }

    /**
     * 获取所有链接的文件
     * 包括直接链接和间接链接的文件
     */
    getLinkedFiles(
        text: string,
        activeFilePath: string
    ): TFile[] {
        return getLinkedFiles(
            text,
            this.vault,
            this.metadataCache,
            activeFilePath,
        );
    }

    /**
     * 检查是否有可用的链接文件
     */
    hasLinkedFiles(text: string, activeFilePath: string): boolean {
        const linkedFiles = this.getLinkedFiles(text, activeFilePath);
        return linkedFiles.length > 0;
    }
} 