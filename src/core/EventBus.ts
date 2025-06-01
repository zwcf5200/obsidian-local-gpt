/**
 * 事件总线系统
 * 用于解耦模块间的通信
 */

export type EventHandler<T = any> = (data: T) => void | Promise<void>;
export type EventUnsubscriber = () => void;

export interface IEventBus {
    emit<T = any>(event: string, data?: T): void;
    on<T = any>(event: string, handler: EventHandler<T>): EventUnsubscriber;
    once<T = any>(event: string, handler: EventHandler<T>): EventUnsubscriber;
    off(event: string, handler?: EventHandler): void;
    clear(): void;
}

/**
 * 事件定义
 */
export const Events = {
    // AI 请求相关事件
    AI_REQUEST_START: 'ai:request:start',
    AI_REQUEST_COMPLETE: 'ai:request:complete',
    AI_REQUEST_ERROR: 'ai:request:error',
    AI_REQUEST_ABORT: 'ai:request:abort',
    
    // 性能监控事件
    PERFORMANCE_METRIC: 'performance:metric',
    TOKEN_USAGE: 'token:usage',
    
    // 进度事件
    PROGRESS_START: 'progress:start',
    PROGRESS_UPDATE: 'progress:update',
    PROGRESS_COMPLETE: 'progress:complete',
    
    // 状态变化事件
    SETTINGS_CHANGED: 'settings:changed',
    PROVIDER_CHANGED: 'provider:changed',
    
    // 文档处理事件
    DOCUMENT_PROCESS_START: 'document:process:start',
    DOCUMENT_PROCESS_COMPLETE: 'document:process:complete',
    
    // 缓存事件
    CACHE_HIT: 'cache:hit',
    CACHE_MISS: 'cache:miss',
    CACHE_UPDATE: 'cache:update',
} as const;

/**
 * 事件数据类型定义
 */
export interface EventDataTypes {
    [Events.AI_REQUEST_START]: {
        action: string;
        provider: string;
        timestamp: number;
    };
    [Events.AI_REQUEST_COMPLETE]: {
        action: string;
        provider: string;
        duration: number;
        success: boolean;
    };
    [Events.AI_REQUEST_ERROR]: {
        action: string;
        error: Error;
        provider?: string;
    };
    [Events.PERFORMANCE_METRIC]: {
        requestId?: string;
        metrics: {
            ttft?: number;
            totalTime?: number;
            tokensPerSecond?: number;
        };
    };
    [Events.TOKEN_USAGE]: {
        inputTokens: number | string;
        outputTokens: number | string;
        totalTokens: number | string;
    };
    [Events.PROGRESS_UPDATE]: {
        current: number;
        total: number;
        message?: string;
    };
}

/**
 * 事件总线实现
 */
export class EventBus implements IEventBus {
    private events: Map<string, Set<EventHandler>> = new Map();
    private onceHandlers: WeakMap<EventHandler, EventHandler> = new WeakMap();

    /**
     * 发送事件
     */
    emit<T = any>(event: string, data?: T): void {
        const handlers = this.events.get(event);
        if (!handlers) return;

        // 复制处理器集合，避免在迭代时修改
        const handlersArray = Array.from(handlers);
        
        for (const handler of handlersArray) {
            try {
                // 异步执行处理器，不阻塞事件发送
                Promise.resolve(handler(data)).catch(error => {
                    console.error(`事件处理器执行失败 [${event}]:`, error);
                });
            } catch (error) {
                console.error(`事件处理器执行失败 [${event}]:`, error);
            }
        }
    }

    /**
     * 监听事件
     */
    on<T = any>(event: string, handler: EventHandler<T>): EventUnsubscriber {
        if (!this.events.has(event)) {
            this.events.set(event, new Set());
        }
        
        this.events.get(event)!.add(handler);
        
        // 返回取消订阅函数
        return () => this.off(event, handler);
    }

    /**
     * 监听事件（仅一次）
     */
    once<T = any>(event: string, handler: EventHandler<T>): EventUnsubscriber {
        const onceHandler: EventHandler<T> = (data) => {
            this.off(event, onceHandler);
            handler(data);
        };
        
        // 保存原始处理器的引用，以便 off 方法可以正确移除
        this.onceHandlers.set(onceHandler, handler);
        
        return this.on(event, onceHandler);
    }

    /**
     * 取消监听
     */
    off(event: string, handler?: EventHandler): void {
        if (!handler) {
            // 移除该事件的所有处理器
            this.events.delete(event);
            return;
        }

        const handlers = this.events.get(event);
        if (!handlers) return;

        // 检查是否是 once 处理器
        const originalHandler = this.onceHandlers.get(handler);
        if (originalHandler) {
            handlers.delete(handler);
            this.onceHandlers.delete(handler);
        } else {
            handlers.delete(handler);
        }

        // 如果没有处理器了，移除事件
        if (handlers.size === 0) {
            this.events.delete(event);
        }
    }

    /**
     * 清空所有事件监听
     */
    clear(): void {
        this.events.clear();
        this.onceHandlers = new WeakMap();
    }

    /**
     * 获取事件监听器数量（用于调试）
     */
    getListenerCount(event?: string): number {
        if (event) {
            return this.events.get(event)?.size || 0;
        }
        
        let total = 0;
        for (const handlers of this.events.values()) {
            total += handlers.size;
        }
        return total;
    }
}

/**
 * 全局事件总线实例
 */
export const globalEventBus = new EventBus(); 