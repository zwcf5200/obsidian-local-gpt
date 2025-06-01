/**
 * Token 估算工具模块
 * 提供 Token 使用量估算功能
 */

/**
 * 智能 Token 估算器
 * 基于经验规则估算文本的 Token 数量
 * 
 * @param text 要估算的文本
 * @param isInput 是否为输入文本（会添加系统提示的开销）
 * @returns 估算的 Token 数量
 */
export function estimateTokens(text: string, isInput: boolean = false): number {
    if (!text) return 0;
    
    // 基于经验的估算规则（改进中文处理）：
    // - 英文：大约4个字符 = 1个token
    // - 中文：每个字符约 0.7 个token
    // - 代码：大约3.5个字符 = 1个token
    // - Markdown 格式化文本：额外 10% 开销
    
    const chineseCharPattern = /[\u4e00-\u9fff]/g;
    const codeBlockPattern = /```[\s\S]*?```/g;
    const inlineCodePattern = /`[^`]+`/g;
    const markdownPattern = /[*_~`#\[\]()]/g;
    
    const chineseChars = (text.match(chineseCharPattern) || []).length;
    const codeBlocks = (text.match(codeBlockPattern) || []).join('');
    const inlineCode = (text.match(inlineCodePattern) || []).join('');
    const markdownChars = (text.match(markdownPattern) || []).length;
    
    // 移除代码块和行内代码来计算普通文本
    const textWithoutCode = text
        .replace(codeBlockPattern, '')
        .replace(inlineCodePattern, '');
    
    const englishChars = textWithoutCode.length - chineseChars;
    
    // 计算不同类型文本的 token
    const chineseTokens = Math.ceil(chineseChars * 0.7); // 改进的中文token估算
    const englishTokens = Math.ceil(englishChars * 0.25); // 4字符/token
    const codeTokens = Math.ceil((codeBlocks.length + inlineCode.length) * 0.285); // 3.5字符/token
    const markdownTokens = Math.ceil(markdownChars * 0.1); // 格式化标记的额外开销
    
    // Ollama模型通常需要更多token，直接使用调整系数
    const modelAdjustment = 1.2; // 适当增加估算值以更接近Ollama实际值
    
    const totalTokens = Math.ceil((chineseTokens + englishTokens + codeTokens + markdownTokens) * modelAdjustment);
    
    // 为输入文本添加系统提示的估算开销
    if (isInput) {
        return Math.max(totalTokens + 60, 15); // 最少15个token，包含系统提示开销
    }
    
    return Math.max(totalTokens, 1); // 最少1个token
}

/**
 * 估算输入输出 tokens
 * 
 * @param inputText 输入文本
 * @param outputText 输出文本
 * @param systemPrompt 系统提示（可选）
 * @returns Token 使用统计
 */
export function estimateTokenUsage(
    inputText: string, 
    outputText: string, 
    systemPrompt?: string
): {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
} {
    const systemTokens = systemPrompt ? estimateTokens(systemPrompt, true) : 0;
    const inputTokens = estimateTokens(inputText, true) + systemTokens;
    const outputTokens = estimateTokens(outputText, false);
    const totalTokens = inputTokens + outputTokens;
    
    return { inputTokens, outputTokens, totalTokens };
} 