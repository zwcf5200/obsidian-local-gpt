/**
 * 动作选择建议器
 * 用于 "：" 触发的动作选择功能
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
import { LocalGPTAction, LocalGPTSettings } from "../interfaces";

export interface IActionSuggestorHost {
    app: App;
    settings: LocalGPTSettings;
    runAction(action: LocalGPTAction, editor: Editor): void;
    saveSettings(): Promise<void>;
}

export class ActionSuggestor extends EditorSuggest<LocalGPTAction> {
    private plugin: IActionSuggestorHost;

    constructor(plugin: IActionSuggestorHost) {
        super(plugin.app);
        this.plugin = plugin;
    }

    // 当用户输入特定字符序列 (例如 "：") 时触发
    onTrigger(
        cursor: EditorPosition,
        editor: Editor,
        _file: TFile | null,
    ): EditorSuggestTriggerInfo | null {
        const line = editor.getLine(cursor.line);
        const sub = line.substring(0, cursor.ch);

        // 检查是否输入了中文冒号 "："
        const match = sub.match(/：([^：]*)$/);
        if (match) {
            return {
                start: { line: cursor.line, ch: match.index! },
                end: cursor,
                query: match[1] || "",
            };
        }
        return null;
    }

    // 获取建议列表
    getSuggestions(
        context: EditorSuggestContext,
    ): LocalGPTAction[] {
        const allActions = this.plugin.settings.actions;
        const query = context.query.toLowerCase();

        // 如果有查询字符串，进行模糊匹配过滤
        if (query) {
            return allActions.filter((action) =>
                action.name.toLowerCase().includes(query),
            );
        }

        // 否则返回所有动作
        return allActions;
    }

    // 渲染每个建议项
    renderSuggestion(action: LocalGPTAction, el: HTMLElement): void {
        // 设置建议项的显示文本为动作名称
        el.setText(action.name);
    }

    // 当用户选择一个建议项时调用
    selectSuggestion(
        action: LocalGPTAction,
        evt: MouseEvent | KeyboardEvent,
    ): void {
        const currentEditor = this.plugin.app.workspace.activeEditor?.editor;
        if (!currentEditor) {
            new Notice("Cannot find active editor to run action.");
            this.close();
            return;
        }
        
        // 执行选择的动作
        this.plugin.runAction(action, currentEditor);
        this.close();

        // 切换默认动作
        this.plugin.settings.defaults.defaultAction = action.name;
        this.plugin.saveSettings();
    }
} 