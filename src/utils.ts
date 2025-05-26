import {
	SELECTION_KEYWORD,
	CONTEXT_KEYWORD,
	CONTEXT_CONDITION_START,
	CONTEXT_CONDITION_END,
	CURRENT_TIME_KEYWORD,
	SHOW_MODEL_INFO_KEYWORD,
	SHOW_PERFORMANCE_KEYWORD,
} from "./defaultSettings";

export function preparePrompt(
	prompt: string = "",
	selectedText: string,
	context: string,
) {
	// 返回一个对象，包含处理后的提示词和控制标志
	let showModelInfo: boolean | undefined = undefined; // 默认为undefined
	let showPerformance: boolean | undefined = undefined; // 默认为undefined
	
	// 处理模型信息显示控制
	if (prompt.includes(SHOW_MODEL_INFO_KEYWORD)) {
		// 使用正则表达式精确匹配关键字及其值
		const modelInfoRegex = new RegExp(SHOW_MODEL_INFO_KEYWORD + "=(true|false)", "g");
		const modelInfoMatch = prompt.match(modelInfoRegex);
		// 确保结果始终为布尔类型
		showModelInfo = modelInfoMatch ? modelInfoMatch[0].endsWith("=true") : undefined;
		// 从提示词中删除关键字
		prompt = prompt.replace(modelInfoRegex, "");
	}
	
	// 处理性能信息显示控制
	if (prompt.includes(SHOW_PERFORMANCE_KEYWORD)) {
		// 使用正则表达式精确匹配关键字及其值
		const perfRegex = new RegExp(SHOW_PERFORMANCE_KEYWORD + "=(true|false)", "g");
		const perfMatch = prompt.match(perfRegex);
		// 确保结果始终为布尔类型
		showPerformance = perfMatch ? perfMatch[0].endsWith("=true") : undefined;
		// 从提示词中删除关键字
		prompt = prompt.replace(perfRegex, "");
	}

	if (prompt.includes(SELECTION_KEYWORD)) {
		prompt = prompt.replace(SELECTION_KEYWORD, selectedText || "");
	} else {
		prompt = [prompt, selectedText].filter(Boolean).join("\n\n");
	}

	if (prompt.includes(CONTEXT_KEYWORD)) {
		prompt = prompt.replace(CONTEXT_KEYWORD, context || "");
	} else {
		if (context.trim()) {
			prompt = [prompt, "Context:\n" + context]
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
			if (!context.trim()) {
				contextBlock = "";
			}
			prompt =
				prompt.substring(0, start) +
				contextBlock +
				prompt.substring(end + CONTEXT_CONDITION_END.length + 1);
		}
	}

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

	return {
		prompt: prompt.trim(),
		showModelInfo,
		showPerformance
	};
}
