import {
	SELECTION_KEYWORD,
	CONTEXT_KEYWORD,
	CONTEXT_CONDITION_START,
	CONTEXT_CONDITION_END,
	CURRENT_TIME_KEYWORD,
	SHOW_MODEL_INFO_KEYWORD,
	SHOW_PERFORMANCE_KEYWORD,
	ALL_TAGS_KEYWORD,
	CURRENT_TAGS_KEYWORD,
} from "./defaultSettings";
import { App, TFile } from "obsidian";
import { generateTagTemplateVariable, getFileTagsArray } from "./tagManager";

// 定义处理结果类型
interface ProcessResult {
	prompt: string;
	showModelInfo?: boolean;
	showPerformance?: boolean;
}

// 变量处理器接口
interface VariableProcessor {
	canProcess(prompt: string): boolean;
	process(prompt: string, context: PromptContext): Promise<string | ProcessResult> | string | ProcessResult;
	isAsync(): boolean; // 添加一个方法来标识处理器是否需要异步处理
}

// 提示词处理上下文对象
interface PromptContext {
	selectedText: string;
	context: string;
	app?: App;
	currentFile?: TFile | null;
	excludeFolders?: string[];
}

// 基础变量处理器（处理选中文本、上下文等基本变量）
class BasicVariableProcessor implements VariableProcessor {
	canProcess(prompt: string): boolean {
		return true; // 基本处理器总是处理
	}

	isAsync(): boolean {
		return false; // 同步处理器
	}

	process(prompt: string, context: PromptContext): string {
		const { selectedText, context: contextText } = context;
		
		if (prompt.includes(SELECTION_KEYWORD)) {
			prompt = prompt.replace(SELECTION_KEYWORD, selectedText || "");
		} else {
			prompt = [prompt, selectedText].filter(Boolean).join("\n\n");
		}

		if (prompt.includes(CONTEXT_KEYWORD)) {
			prompt = prompt.replace(CONTEXT_KEYWORD, contextText || "");
		} else {
			if (contextText.trim()) {
				prompt = [prompt, "Context:\n" + contextText]
					.filter(Boolean)
					.join("\n\n");
			}
		}

		if (
			prompt.includes(CONTEXT_CONDITION_START) &&
			prompt.includes(CONTEXT_CONDITION_END)
		) {
			const start = prompt.indexOf(CONTEXT_CONDITION_START) - 1;
			const end = prompt.indexOf(CONTEXT_CONDITION_END);
			if (start !== -1 && end !== -1 && start < end) {
				let contextBlock = prompt.substring(
					start + CONTEXT_CONDITION_START.length + 1,
					end,
				);
				if (!contextText.trim()) {
					contextBlock = "";
				}
				prompt =
					prompt.substring(0, start) +
					contextBlock +
					prompt.substring(end + CONTEXT_CONDITION_END.length + 1);
			}
		}

		return prompt;
	}
}

// 时间变量处理器
class TimeVariableProcessor implements VariableProcessor {
	canProcess(prompt: string): boolean {
		return prompt.includes(CURRENT_TIME_KEYWORD);
	}

	isAsync(): boolean {
		return false; // 同步处理器
	}

	process(prompt: string): string {
		if (prompt.includes(CURRENT_TIME_KEYWORD)) {
			const now = new Date();
			const formattedTime = now.toLocaleString("zh-CN", {
				timeZone: "Asia/Shanghai",
				hour12: false,
				year: 'numeric',
				month: '2-digit',
				day: '2-digit',
				hour: '2-digit',
				minute: '2-digit',
				second: '2-digit',
				weekday: 'long'
			});
			prompt = prompt.replace(CURRENT_TIME_KEYWORD, formattedTime);
		}
		return prompt;
	}
}

// 控制参数处理器
class ControlParameterProcessor implements VariableProcessor {
	canProcess(prompt: string): boolean {
		return prompt.includes(SHOW_MODEL_INFO_KEYWORD) || prompt.includes(SHOW_PERFORMANCE_KEYWORD);
	}

	isAsync(): boolean {
		return false; // 同步处理器
	}

	process(prompt: string): ProcessResult {
		let showModelInfo: boolean | undefined = undefined;
		let showPerformance: boolean | undefined = undefined;
		
		// 处理模型信息显示控制
		if (prompt.includes(SHOW_MODEL_INFO_KEYWORD)) {
			const modelInfoRegex = new RegExp(SHOW_MODEL_INFO_KEYWORD + "=(true|false)", "g");
			const modelInfoMatch = prompt.match(modelInfoRegex);
			showModelInfo = modelInfoMatch ? modelInfoMatch[0].endsWith("=true") : undefined;
			prompt = prompt.replace(modelInfoRegex, "");
		}
		
		// 处理性能信息显示控制
		if (prompt.includes(SHOW_PERFORMANCE_KEYWORD)) {
			const perfRegex = new RegExp(SHOW_PERFORMANCE_KEYWORD + "=(true|false)", "g");
			const perfMatch = prompt.match(perfRegex);
			showPerformance = perfMatch ? perfMatch[0].endsWith("=true") : undefined;
			prompt = prompt.replace(perfRegex, "");
		}
		
		return {
			prompt,
			showModelInfo,
			showPerformance
		};
	}
}

// 标签变量处理器
class TagVariableProcessor implements VariableProcessor {
	canProcess(prompt: string): boolean {
		return prompt.includes(ALL_TAGS_KEYWORD) || prompt.includes(CURRENT_TAGS_KEYWORD);
	}

	isAsync(): boolean {
		return true; // 异步处理器
	}

	async process(prompt: string, context: PromptContext): Promise<string> {
		const { app, currentFile, excludeFolders } = context;
		
		if (!app) {
			return prompt;
		}
		
		// 处理所有标签变量
		if (prompt.includes(ALL_TAGS_KEYWORD)) {
			const allTagsVar = await generateTagTemplateVariable(app, excludeFolders || []);
			prompt = prompt.replace(
				new RegExp(ALL_TAGS_KEYWORD, "g"),
				allTagsVar
			);
		}
		
		// 处理当前文件标签变量
		if (prompt.includes(CURRENT_TAGS_KEYWORD)) {
			let currentTagsVar = "当前文档没有标签";
			
			if (currentFile) {
				const currentTags = getFileTagsArray(app, currentFile);
				if (currentTags.length > 0) {
					currentTagsVar = `当前标签: ${currentTags.join(", ")}`;
				}
			}
			
			prompt = prompt.replace(
				new RegExp(CURRENT_TAGS_KEYWORD, "g"),
				currentTagsVar
			);
		}
		
		return prompt;
	}
}

// 提示词处理器类
class PromptProcessor {
	private processors: VariableProcessor[] = [];
	
	constructor() {
		// 注册处理器（顺序很重要）
		this.registerProcessor(new ControlParameterProcessor());
		this.registerProcessor(new BasicVariableProcessor());
		this.registerProcessor(new TimeVariableProcessor());
		this.registerProcessor(new TagVariableProcessor());
		// 可以随时添加新的处理器，无需修改核心代码
	}
	
	registerProcessor(processor: VariableProcessor) {
		this.processors.push(processor);
	}
	
	// 检查是否需要异步处理
	needsAsync(prompt: string): boolean {
		for (const processor of this.processors) {
			if (processor.canProcess(prompt) && processor.isAsync()) {
				return true;
			}
		}
		return false;
	}
	
	// 同步处理方法
	processSync(prompt: string, context: PromptContext): ProcessResult {
		let result: ProcessResult = {
			prompt: prompt,
			showModelInfo: undefined,
			showPerformance: undefined
		};
		
		// 遍历同步处理器
		for (const processor of this.processors) {
			if (processor.canProcess(result.prompt) && !processor.isAsync()) {
				const processed = processor.process(result.prompt, context);
				
				if (typeof processed === 'string') {
					result.prompt = processed;
				} else if (processed && typeof processed === 'object') {
					// 合并处理结果
					result = {
						...result,
						...processed
					};
				}
			}
		}
		
		// 最终清理
		result.prompt = result.prompt.trim();
		
		return result;
	}
	
	// 异步处理方法
	async process(prompt: string, context: PromptContext): Promise<ProcessResult> {
		let result: ProcessResult = {
			prompt: prompt,
			showModelInfo: undefined,
			showPerformance: undefined
		};
		
		// 先处理所有同步处理器
		result = this.processSync(prompt, context);
		
		// 再处理异步处理器
		for (const processor of this.processors) {
			if (processor.canProcess(result.prompt) && processor.isAsync()) {
				const processed = await processor.process(result.prompt, context);
				
				if (typeof processed === 'string') {
					result.prompt = processed;
				} else if (processed && typeof processed === 'object') {
					// 合并处理结果
					result = {
						...result,
						...processed
					};
				}
			}
		}
		
		// 最终清理
		result.prompt = result.prompt.trim();
		
		return result;
	}
}

// 创建全局处理器实例
const promptProcessor = new PromptProcessor();

/**
 * 准备提示词，处理变量替换
 * 统一接口，支持所有类型的变量处理
 * 
 * 根据参数和处理需求自动选择同步或异步处理
 */
export function preparePrompt(
	prompt: string,
	selectedText: string,
	context: string
): ProcessResult;

export function preparePrompt(
	prompt: string,
	selectedText: string,
	context: string,
	app: App,
	currentFile?: TFile | null,
	excludeFolders?: string[]
): Promise<ProcessResult>;

export function preparePrompt(
	prompt: string = "",
	selectedText: string,
	context: string,
	app?: App,
	currentFile?: TFile | null,
	excludeFolders?: string[]
): ProcessResult | Promise<ProcessResult> {
	// 创建上下文对象
	const promptContext: PromptContext = {
		selectedText,
		context,
		app,
		currentFile,
		excludeFolders
	};
	
	// 如果提供了App参数或检测到需要异步处理的变量，使用异步处理
	if (app || promptProcessor.needsAsync(prompt)) {
		return promptProcessor.process(prompt, promptContext);
	}
	
	// 否则使用同步处理
	return promptProcessor.processSync(prompt, promptContext);
}
