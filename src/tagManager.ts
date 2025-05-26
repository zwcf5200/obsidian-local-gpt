import { App, TFile, CachedMetadata, getAllTags } from "obsidian";
import { TagStats } from "./interfaces";
import { logger } from "./logger";

// 标签缓存
let tagStatsCache: TagStats | null = null;

/**
 * 获取仓库中所有标签的统计信息
 * @param app Obsidian App实例
 * @param excludeFolders 需要排除的文件夹路径数组
 * @param forceRefresh 是否强制刷新缓存
 * @returns 包含所有标签及其引用次数的对象
 */
export async function getAllTagStats(
    app: App, 
    excludeFolders: string[] = [], 
    forceRefresh: boolean = false
): Promise<TagStats> {
    // 如果缓存可用且不需要强制刷新，则返回缓存
    if (tagStatsCache !== null && !forceRefresh) {
        return tagStatsCache;
    }

    logger.info("正在获取所有标签统计信息...");
    const startTime = Date.now();

    // 手动获取所有标签的统计信息
    const tagStats: TagStats = {};
    const files = app.vault.getMarkdownFiles();
    
    if (!files || files.length === 0) {
        logger.info("未找到任何文件");
        return {};
    }
    
    // 遍历所有文件获取标签
    for (const file of files) {
        // 检查文件是否在排除文件夹中
        if (excludeFolders.some(folder => file.path.startsWith(folder))) {
            continue;
        }
        
        // 获取文件缓存
        const fileCache = app.metadataCache.getFileCache(file);
        if (!fileCache) continue;
        
        // 使用Obsidian的getAllTags工具函数直接获取文件的所有标签
        // 这个函数会处理嵌套标签，比如#tag/subtag会返回#tag和#tag/subtag
        const fileTags = getAllTags(fileCache);
        
        if (!fileTags || fileTags.length === 0) {
            continue;
        }
        
        // 统计标签
        for (const tag of fileTags) {
            tagStats[tag] = (tagStats[tag] || 0) + 1;
        }
    }
    
    // 更新缓存
    tagStatsCache = tagStats;
    logger.info(`标签统计完成，共${Object.keys(tagStats).length}个标签，耗时${Date.now() - startTime}ms`);
    return tagStats;
}

/**
 * 清除标签缓存
 */
export function clearTagCache(): void {
    tagStatsCache = null;
    logger.info("标签缓存已清除");
}

/**
 * 获取特定文件的标签
 * @param app Obsidian App实例
 * @param file 文件对象
 * @returns 标签数组
 */
export function getFileTagsArray(app: App, file: TFile): string[] {
    // 获取文件缓存
    const fileCache = app.metadataCache.getFileCache(file);
    if (!fileCache) return [];
    
    // 使用Obsidian提供的getAllTags函数获取所有标签，包括嵌套标签
    return getAllTags(fileCache) || [];
}

/**
 * 生成标签模板变量
 * @param app Obsidian App实例
 * @param excludeFolders 需要排除的文件夹
 * @param limit 限制返回的标签数量，默认前100个
 * @returns 用于模板的标签数据字符串
 */
export async function generateTagTemplateVariable(
    app: App, 
    excludeFolders: string[] = [], 
    limit: number = 100
): Promise<string> {
    const tagStats = await getAllTagStats(app, excludeFolders);
    
    // 按引用次数排序标签
    const sortedTags = Object.entries(tagStats)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit);
    
    // 总标签数
    const totalTags = Object.keys(tagStats).length;
    
    // 构建模板字符串
    let template = `总标签数: ${totalTags}\n\n最常用的${Math.min(limit, sortedTags.length)}个标签:\n`;
    
    sortedTags.forEach(([tag, count], index) => {
        template += `${index + 1}. ${tag} (${count}次引用)\n`;
    });
    
    return template;
}

/**
 * 获取标签推荐
 * 这个函数将通过AI模型分析笔记内容并推荐标签
 * 实际实现将在main.ts中通过AI模型完成
 */
export async function getTagRecommendations(
    content: string,
    currentTags: string[],
    allTags: TagStats
): Promise<string[]> {
    // 此函数将由AI模型实现
    // 在这里只是一个接口定义
    return [];
} 