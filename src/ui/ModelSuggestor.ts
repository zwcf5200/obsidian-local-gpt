/**
 * 模型选择建议器
 * 用于 "@" 触发的模型选择功能
 */

import {
    EditorSuggest,
    EditorPosition,
    Editor,
    TFile,
    EditorSuggestTriggerInfo,
    EditorSuggestContext,
    App,
    Notice
} from "obsidian";
import {
    IAIProvider,
    IAIProvidersService,
    waitForAI
} from "@obsidian-ai-providers/sdk";
import { isVisionCapableModel } from "../utils/index";
import { LocalGPTSettings } from "../interfaces";

export interface IModelSuggestorHost {
    app: App;
    settings: LocalGPTSettings;
    saveSettings(): Promise<void>;
}

export class ModelSuggestor extends EditorSuggest<IAIProvider> {
    private plugin: IModelSuggestorHost;
    private aiProvidersService: IAIProvidersService | null = null;

    constructor(plugin: IModelSuggestorHost) {
        super(plugin.app);
        this.plugin = plugin;
        this.loadProviders();
    }

    // 异步加载 AI Providers 服务
    private async loadProviders() {
        try {
            const aiRequestWaiter = await waitForAI();
            this.aiProvidersService = await aiRequestWaiter.promise;
        } catch (error) {
            console.error(
                "Error loading AI providers for ModelSuggestor:",
                error,
            );
            new Notice(
                "Failed to load AI providers for model suggestion. Model selection via '@' might not work.",
            );
        }
    }

    // 当用户输入特定字符 (例如 "@") 时触发
    onTrigger(
        cursor: EditorPosition,
        editor: Editor,
        _file: TFile | null,
    ): EditorSuggestTriggerInfo | null {
        const line = editor.getLine(cursor.line);
        const sub = line.substring(0, cursor.ch);
        const match = sub.match(/@([\w\s]*)$/);

        if (match) {
            return {
                start: { line: cursor.line, ch: match.index! },
                end: cursor,
                query: match[1],
            };
        }
        return null;
    }

    // 获取建议列表
    getSuggestions(
        context: EditorSuggestContext,
    ): IAIProvider[] {
        if (!this.aiProvidersService) {
            return [];
        }

        const providers = this.aiProvidersService.providers;
        const query = context.query.toLowerCase();

        // 计算匹配分数的函数
        const getMatchScore = (provider: IAIProvider): number => {
            if (!query) return 0;

            const name = provider.name.toLowerCase();
            const model = provider.model?.toLowerCase() || "";

            // 完全匹配得分最高
            if (name === query || model === query) return 100;

            // 开头匹配得分次之
            if (name.startsWith(query) || model.startsWith(query)) return 80;

            // 包含匹配得分较低
            if (name.includes(query) || model.includes(query)) return 50;

            return 0;
        };

        // 过滤并评分所有模型
        const filteredProviders: IAIProvider[] = [];
        let bestMatch: IAIProvider | null = null;
        let highestScore = 0;

        providers.forEach((provider) => {
            // 计算匹配分数
            const score = getMatchScore(provider);

            // 更新最佳匹配
            if (score > highestScore) {
                highestScore = score;
                bestMatch = provider;
            }

            // 根据查询过滤
            const matchesQuery = score > 0 || !query;

            if (matchesQuery) {
                filteredProviders.push(provider);
            }
        });

        // 排序：最佳匹配放在第一位，其余按名称排序
        const sortedProviders = [...filteredProviders];
        
        if (bestMatch && query && highestScore > 0) {
            // 移除最佳匹配项，然后将其放在第一位
            const bestMatchIndex = sortedProviders.findIndex(p => p.id === bestMatch!.id);
            if (bestMatchIndex > -1) {
                sortedProviders.splice(bestMatchIndex, 1);
            }
            
            // 剩余项按名称排序
            sortedProviders.sort((a, b) => a.name.localeCompare(b.name));
            
            // 最佳匹配放在第一位
            sortedProviders.unshift(bestMatch);
        } else {
            // 没有查询时，简单按名称排序
            sortedProviders.sort((a, b) => a.name.localeCompare(b.name));
        }

        return sortedProviders;
    }

    // 渲染每个建议项
    renderSuggestion(suggestion: IAIProvider, el: HTMLElement): void {
        // 使用智能视觉模型判断器确定模型类型
        const isVisionModel = isVisionCapableModel(suggestion);
        
        // 根据模型类型选择图标
        const modelTypeIcon = isVisionModel ? "👁️" : "💬";
        
        // 设置建议项的显示文本
        const baseText = `${suggestion.name} (${
            suggestion.model || "Default"
        })`;
        
        const displayText = `${baseText} ${modelTypeIcon}`;
        el.setText(displayText);

        // 为当前选中的模型添加标记
        const currentMainId = this.plugin.settings.aiProviders.main;
        const currentVisionId = this.plugin.settings.aiProviders.vision;

        if (
            suggestion.id === currentMainId ||
            suggestion.id === currentVisionId
        ) {
            el.setText(displayText + " ✓");
            el.style.fontWeight = "bold";
        }
    }

    // 当用户选择一个建议项时调用
    selectSuggestion(
        suggestion: IAIProvider,
        evt: MouseEvent | KeyboardEvent,
    ): void {
        // 获取当前编辑器
        const editor = this.plugin.app.workspace.activeEditor?.editor;
        if (!editor) {
            new Notice("无法找到活动编辑器");
            this.close();
            return;
        }

        // 获取触发信息用于替换文本
        if (this.context) {
            // 构建替换文本：@模型名称
            const modelName = suggestion.model || suggestion.name;
            const replacementText = `@${modelName} `;

            // 替换编辑器中的文本
            editor.replaceRange(
                replacementText,
                this.context.start,
                this.context.end,
            );
        }

        // 使用智能视觉模型判断器
        const isVisionModel = isVisionCapableModel(suggestion);

        // 更新对应的全局配置
        if (isVisionModel) {
            // 更新视觉模型配置
            this.plugin.settings.aiProviders.vision = suggestion.id;
            new Notice(`已切换视觉模型为: ${suggestion.name}`);
        } else {
            // 更新主模型配置
            this.plugin.settings.aiProviders.main = suggestion.id;
            new Notice(`已切换主模型为: ${suggestion.name}`);
        }

        // 保存设置
        this.plugin.saveSettings();
        this.close(); // 关闭建议器
    }
} 