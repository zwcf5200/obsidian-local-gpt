/**
 * 统一错误处理系统
 * 提供一致的错误处理和通知机制
 */

import { Notice } from "obsidian";
import { IEventBus, Events } from "./EventBus";
import { logger } from "../logger";

export enum ErrorSeverity {
    INFO = 'info',
    WARNING = 'warning',
    ERROR = 'error',
    CRITICAL = 'critical'
}

export interface ErrorContext {
    action?: string;
    provider?: string;
    module?: string;
    userId?: string;
    metadata?: Record<string, any>;
}

export interface IErrorHandler {
    handle(error: Error, context?: ErrorContext): void;
    notify(message: string, severity?: ErrorSeverity): void;
    wrap<T>(fn: () => T | Promise<T>, context?: ErrorContext): Promise<T>;
}

/**
 * 自定义错误类
 */
export class LocalGPTError extends Error {
    constructor(
        message: string,
        public severity: ErrorSeverity = ErrorSeverity.ERROR,
        public context?: ErrorContext,
        public originalError?: Error
    ) {
        super(message);
        this.name = 'LocalGPTError';
        
        // 保持原始错误的堆栈跟踪
        if (originalError?.stack) {
            this.stack = originalError.stack;
        }
    }
}

/**
 * 特定类型的错误
 */
export class AIRequestError extends LocalGPTError {
    constructor(message: string, context?: ErrorContext, originalError?: Error) {
        super(message, ErrorSeverity.ERROR, context, originalError);
        this.name = 'AIRequestError';
    }
}

export class ConfigurationError extends LocalGPTError {
    constructor(message: string, context?: ErrorContext) {
        super(message, ErrorSeverity.WARNING, context);
        this.name = 'ConfigurationError';
    }
}

export class ValidationError extends LocalGPTError {
    constructor(message: string, context?: ErrorContext) {
        super(message, ErrorSeverity.WARNING, context);
        this.name = 'ValidationError';
    }
}

/**
 * 错误处理器实现
 */
export class ErrorHandler implements IErrorHandler {
    private eventBus?: IEventBus;
    private errorHistory: Array<{ error: Error; timestamp: Date; context?: ErrorContext }> = [];
    private readonly maxHistorySize = 100;

    constructor(eventBus?: IEventBus) {
        this.eventBus = eventBus;
    }

    /**
     * 处理错误
     */
    handle(error: Error, context?: ErrorContext): void {
        // 记录错误历史
        this.addToHistory(error, context);

        // 确定错误严重程度
        const severity = this.determineSeverity(error);
        
        // 记录日志
        this.logError(error, severity, context);
        
        // 发送事件
        if (this.eventBus) {
            this.eventBus.emit(Events.AI_REQUEST_ERROR, {
                action: context?.action || 'unknown',
                error,
                provider: context?.provider
            });
        }
        
        // 显示用户通知
        this.showNotification(error, severity, context);
    }

    /**
     * 显示通知
     */
    notify(message: string, severity: ErrorSeverity = ErrorSeverity.INFO): void {
        const prefix = this.getNotificationPrefix(severity);
        const fullMessage = prefix ? `${prefix} ${message}` : message;
        
        // 根据严重程度设置通知持续时间
        const duration = severity === ErrorSeverity.CRITICAL ? 0 : 
                        severity === ErrorSeverity.ERROR ? 10000 : 
                        5000;
        
        new Notice(fullMessage, duration);
    }

    /**
     * 包装函数以自动处理错误
     */
    async wrap<T>(fn: () => T | Promise<T>, context?: ErrorContext): Promise<T> {
        try {
            return await Promise.resolve(fn());
        } catch (error) {
            this.handle(error as Error, context);
            throw error;
        }
    }

    /**
     * 确定错误严重程度
     */
    private determineSeverity(error: Error): ErrorSeverity {
        if (error instanceof LocalGPTError) {
            return error.severity;
        }
        
        // 根据错误类型判断严重程度
        if (error.name === 'AbortError') {
            return ErrorSeverity.INFO;
        }
        
        if (error.message.includes('网络') || error.message.includes('network')) {
            return ErrorSeverity.WARNING;
        }
        
        return ErrorSeverity.ERROR;
    }

    /**
     * 记录错误日志
     */
    private logError(error: Error, severity: ErrorSeverity, context?: ErrorContext): void {
        const logData = {
            message: error.message,
            severity,
            context,
            stack: error.stack
        };
        
        switch (severity) {
            case ErrorSeverity.INFO:
                logger.info('错误信息', logData);
                break;
            case ErrorSeverity.WARNING:
                logger.warn('警告', logData);
                break;
            case ErrorSeverity.ERROR:
            case ErrorSeverity.CRITICAL:
                logger.error('错误', logData);
                break;
        }
    }

    /**
     * 显示错误通知
     */
    private showNotification(error: Error, severity: ErrorSeverity, context?: ErrorContext): void {
        // 用户取消操作不需要通知
        if (error.name === 'AbortError') {
            return;
        }
        
        // 构建用户友好的错误消息
        let message = this.getUserFriendlyMessage(error, context);
        
        this.notify(message, severity);
    }

    /**
     * 获取用户友好的错误消息
     */
    private getUserFriendlyMessage(error: Error, context?: ErrorContext): string {
        // AI 请求错误
        if (error instanceof AIRequestError || context?.action) {
            if (error.message.includes('401') || error.message.includes('unauthorized')) {
                return 'AI 服务认证失败，请检查 API 密钥配置';
            }
            if (error.message.includes('429') || error.message.includes('rate limit')) {
                return 'AI 服务请求过于频繁，请稍后再试';
            }
            if (error.message.includes('网络') || error.message.includes('network')) {
                return 'AI 服务连接失败，请检查网络连接';
            }
            return `AI 请求失败: ${error.message}`;
        }
        
        // 配置错误
        if (error instanceof ConfigurationError) {
            return `配置错误: ${error.message}`;
        }
        
        // 验证错误
        if (error instanceof ValidationError) {
            return `输入验证失败: ${error.message}`;
        }
        
        // 默认错误消息
        return error.message || '发生未知错误';
    }

    /**
     * 获取通知前缀
     */
    private getNotificationPrefix(severity: ErrorSeverity): string {
        switch (severity) {
            case ErrorSeverity.INFO:
                return 'ℹ️';
            case ErrorSeverity.WARNING:
                return '⚠️';
            case ErrorSeverity.ERROR:
                return '❌';
            case ErrorSeverity.CRITICAL:
                return '🚨';
            default:
                return '';
        }
    }

    /**
     * 添加到错误历史
     */
    private addToHistory(error: Error, context?: ErrorContext): void {
        this.errorHistory.push({
            error,
            timestamp: new Date(),
            context
        });
        
        // 限制历史记录大小
        if (this.errorHistory.length > this.maxHistorySize) {
            this.errorHistory.shift();
        }
    }

    /**
     * 获取错误历史（用于调试）
     */
    getErrorHistory(): Array<{ error: Error; timestamp: Date; context?: ErrorContext }> {
        return [...this.errorHistory];
    }

    /**
     * 清空错误历史
     */
    clearHistory(): void {
        this.errorHistory = [];
    }
}

/**
 * 错误边界装饰器
 */
export function errorBoundary(context?: ErrorContext) {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        const originalMethod = descriptor.value;
        
        descriptor.value = async function (...args: any[]) {
            try {
                return await originalMethod.apply(this, args);
            } catch (error) {
                // 如果类实例有 errorHandler 属性，使用它
                if (this.errorHandler && typeof this.errorHandler.handle === 'function') {
                    this.errorHandler.handle(error as Error, {
                        ...context,
                        module: target.constructor.name,
                        action: propertyKey
                    });
                } else {
                    // 否则直接记录错误
                    console.error(`Error in ${target.constructor.name}.${propertyKey}:`, error);
                }
                throw error;
            }
        };
        
        return descriptor;
    };
} 