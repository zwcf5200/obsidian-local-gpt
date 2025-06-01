/**
 * 文本处理工具模块
 * 提供文本格式化、清理等功能
 */

/**
 * 处理 AI 生成的文本
 * 移除思考标签并格式化输出
 * 
 * @param text AI 生成的原始文本
 * @param selectedText 用户选中的文本（保留参数以保持兼容性）
 * @returns 格式化后的文本
 */
export function processGeneratedText(text: string, selectedText: string): string {
    if (!text.trim()) {
        return "";
    }

    // 移除 <think>...</think> 标签及其内容
    const cleanText = removeThinkingTags(text).trim();

    // 返回格式化后的文本
    return ["\n", cleanText, "\n"].join("");
}

/**
 * 移除文本中的思考标签
 * @param text 包含思考标签的文本
 * @returns 清理后的文本
 */
export function removeThinkingTags(text: string): string {
    return text.replace(/^<think>[\s\S]*?<\/think>\s*/, "");
}

/**
 * 从文本中提取图片链接
 * 支持 ![[文件名.png]] 和 [[文件名.png]] 格式
 * 
 * @param text 包含图片链接的文本
 * @returns 图片文件名数组和清理后的文本
 */
export function extractImageLinks(text: string): {
    fileNames: string[];
    cleanedText: string;
} {
    const regexp = /(!?\[\[(.+?\.(?:png|jpe?g))\]\])/gi;
    
    // 提取所有图片文件名
    const fileNames = Array.from(
        text.matchAll(regexp),
        (match) => match[2]
    );
    
    // 从文本中移除图片链接
    const cleanedText = text.replace(regexp, "");
    
    return { fileNames, cleanedText };
} 