/**
 * 模型能力检测工具模块
 * 提供 AI 模型能力判断和图标生成功能
 */

import { IAIProvider, AICapability } from "@obsidian-ai-providers/sdk";

/**
 * 智能视觉模型判断器
 * 判断给定的 AI Provider 是否支持视觉功能
 * 
 * @param provider AI Provider 实例
 * @returns 是否支持视觉功能
 */
export function isVisionCapableModel(provider: IAIProvider): boolean {
    const providerWithCapabilities = provider as any;
    
    // 1. 首先检查 capabilities.vision 属性（最可靠）
    if (providerWithCapabilities.capabilities?.vision) {
        return true;
    }
    
    // 2. 基于准确的模型名称匹配
    const modelName = provider.model?.toLowerCase() || "";
    const providerName = provider.name.toLowerCase();
    
    // OpenAI 视觉模型
    const openaiVisionModels = [
        "gpt-4-vision-preview",
        "gpt-4o",
        "gpt-4o-mini", 
        "gpt-4o-2024-05-13",
        "gpt-4o-2024-08-06",
        "gpt-4-turbo-vision"
    ];
    
    // Anthropic 视觉模型 (Claude 3系列)
    const anthropicVisionModels = [
        "claude-3-opus",
        "claude-3-sonnet", 
        "claude-3-haiku",
        "claude-3.5-sonnet",
        "claude-3-5-sonnet"
    ];
    
    // Google 视觉模型
    const googleVisionModels = [
        "gemini-pro-vision",
        "gemini-1.5-pro",
        "gemini-1.5-flash",
        "gemini-2.0-flash"
    ];
    
    // 其他已知视觉模型
    const otherVisionModels = [
        "llava",
        "llava-llama3", 
        "llava-phi3",
        "moondream",
        "bakllava",
        "cogvlm"
    ];
    
    // 检查精确匹配
    const allVisionModels = [
        ...openaiVisionModels,
        ...anthropicVisionModels, 
        ...googleVisionModels,
        ...otherVisionModels
    ];
    
    for (const visionModel of allVisionModels) {
        if (modelName.includes(visionModel)) {
            return true;
        }
    }
    
    // 3. 检查名称中包含 "vision" 的模型
    if (modelName.includes("vision") || providerName.includes("vision")) {
        return true;
    }
    
    // 4. 特殊情况：一些provider可能在名称中标注了视觉能力
    const visionKeywords = ["visual", "multimodal", "mm", "vlm"];
    for (const keyword of visionKeywords) {
        if (modelName.includes(keyword) || providerName.includes(keyword)) {
            return true;
        }
    }
    
    return false;
}

/**
 * 根据模型能力生成图标
 * 
 * @param capabilities 模型能力数组
 * @returns 能力图标字符串
 */
export function getCapabilityIcons(capabilities: AICapability[]): string {
    const iconMap: Record<AICapability, string> = {
        'dialogue': '💬',
        'vision': '👁️',
        'tool_use': '🔧',
        'text_to_image': '🖼️',
        'embedding': '🔍'
    };
    
    if (!capabilities || capabilities.length === 0) {
        return '';
    }
    
    return capabilities.map(cap => iconMap[cap] || '').join(' ');
} 