/**
 * 依赖注入容器
 * 管理服务的生命周期和依赖关系
 */

export type ServiceFactory<T> = (container: IServiceContainer) => T;
export type ServiceToken<T> = string | symbol;

export interface ServiceDescriptor<T> {
    token: ServiceToken<T>;
    factory: ServiceFactory<T>;
    singleton: boolean;
}

export interface IServiceContainer {
    register<T>(token: ServiceToken<T>, factory: ServiceFactory<T>, options?: { singleton?: boolean }): void;
    registerInstance<T>(token: ServiceToken<T>, instance: T): void;
    get<T>(token: ServiceToken<T>): T;
    has(token: ServiceToken<any>): boolean;
    create<T>(factory: ServiceFactory<T>): T;
    clear(): void;
}

/**
 * 服务令牌定义
 */
export const ServiceTokens = {
    // 核心服务
    App: Symbol('App'),
    Plugin: Symbol('Plugin'),
    Settings: Symbol('Settings'),
    
    // 管理器服务
    AIServiceManager: Symbol('AIServiceManager'),
    StatusBarManager: Symbol('StatusBarManager'),
    ActionExecutor: Symbol('ActionExecutor'),
    ContextEnhancer: Symbol('ContextEnhancer'),
    
    // 基础设施服务
    EventBus: Symbol('EventBus'),
    ErrorHandler: Symbol('ErrorHandler'),
    Logger: Symbol('Logger'),
    
    // UI 服务
    ModelSuggestor: Symbol('ModelSuggestor'),
    ActionSuggestor: Symbol('ActionSuggestor'),
} as const;

/**
 * 依赖注入容器实现
 */
export class ServiceContainer implements IServiceContainer {
    private services: Map<ServiceToken<any>, ServiceDescriptor<any>> = new Map();
    private instances: Map<ServiceToken<any>, any> = new Map();
    private resolving: Set<ServiceToken<any>> = new Set();

    /**
     * 注册服务
     */
    register<T>(
        token: ServiceToken<T>,
        factory: ServiceFactory<T>,
        options: { singleton?: boolean } = {}
    ): void {
        const { singleton = true } = options;
        
        this.services.set(token, {
            token,
            factory,
            singleton
        });
        
        // 如果是单例且已有实例，清除旧实例
        if (singleton && this.instances.has(token)) {
            this.instances.delete(token);
        }
    }

    /**
     * 注册服务实例
     */
    registerInstance<T>(token: ServiceToken<T>, instance: T): void {
        this.instances.set(token, instance);
        
        // 同时注册为服务，以便统一管理
        this.services.set(token, {
            token,
            factory: () => instance,
            singleton: true
        });
    }

    /**
     * 获取服务
     */
    get<T>(token: ServiceToken<T>): T {
        // 检查是否有现成的实例
        if (this.instances.has(token)) {
            return this.instances.get(token);
        }

        // 获取服务描述
        const descriptor = this.services.get(token);
        if (!descriptor) {
            throw new Error(`服务未注册: ${String(token)}`);
        }

        // 检查循环依赖
        if (this.resolving.has(token)) {
            throw new Error(`检测到循环依赖: ${String(token)}`);
        }

        try {
            this.resolving.add(token);
            
            // 创建实例
            const instance = descriptor.factory(this);
            
            // 如果是单例，缓存实例
            if (descriptor.singleton) {
                this.instances.set(token, instance);
            }
            
            return instance;
        } finally {
            this.resolving.delete(token);
        }
    }

    /**
     * 检查服务是否已注册
     */
    has(token: ServiceToken<any>): boolean {
        return this.services.has(token) || this.instances.has(token);
    }

    /**
     * 创建服务实例（不缓存）
     */
    create<T>(factory: ServiceFactory<T>): T {
        return factory(this);
    }

    /**
     * 清空容器
     */
    clear(): void {
        // 调用所有实例的 dispose 方法（如果有）
        for (const instance of this.instances.values()) {
            if (typeof instance?.dispose === 'function') {
                try {
                    instance.dispose();
                } catch (error) {
                    console.error('服务清理失败:', error);
                }
            }
        }
        
        this.services.clear();
        this.instances.clear();
        this.resolving.clear();
    }

    /**
     * 获取所有已注册的服务（用于调试）
     */
    getRegisteredServices(): string[] {
        return Array.from(this.services.keys()).map(token => String(token));
    }
}

/**
 * 服务定位器模式的辅助类
 */
export class ServiceLocator {
    private static container: IServiceContainer;

    /**
     * 设置全局容器
     */
    static setContainer(container: IServiceContainer): void {
        ServiceLocator.container = container;
    }

    /**
     * 获取服务
     */
    static get<T>(token: ServiceToken<T>): T {
        if (!ServiceLocator.container) {
            throw new Error('服务容器未初始化');
        }
        return ServiceLocator.container.get(token);
    }

    /**
     * 获取容器实例
     */
    static getContainer(): IServiceContainer {
        if (!ServiceLocator.container) {
            throw new Error('服务容器未初始化');
        }
        return ServiceLocator.container;
    }
}
