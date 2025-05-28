import { Plugin, Editor } from "obsidian";
import { LocalGPTSettings, LocalGPTAction } from "./interfaces";
import { IAIProvidersService, IAIProvider, AICapability } from "@obsidian-ai-providers/sdk";

declare global {
    // 为模型建议器和动作建议器定义类型
    class ModelSuggestor {
        constructor(plugin: LocalGPT);
    }

    class ActionSuggestor {
        constructor(plugin: LocalGPT);
    }

    // 为LocalGPT类型扩展
    interface LocalGPT extends Plugin {
        settings: LocalGPTSettings;
        saveSettings(): Promise<void>;
        reload(): void;
        checkUpdates(): void;
        refreshTagCache(forceRefresh: boolean): Promise<void>;
        estimateTokenUsage(inputText: string, outputText: string, systemPrompt?: string): {
            inputTokens: number;
            outputTokens: number;
            totalTokens: number;
        };
        getCapabilityIcons(capabilities: AICapability[]): string;
        initializeProgress(): void;
        hideStatusBar(): void;
        addTotalProgressSteps(steps: number): void;
        updateCompletedSteps(steps: number): void;
        escapeHandler: (event: KeyboardEvent) => void;
        runAction(action: LocalGPTAction, editor: Editor): Promise<void>;
    }
} 