/**
 * 核心功能模块主入口
 * 导出所有核心功能类
 */

// 动作执行器
export { ActionExecutor } from './ActionExecutor';
export type { IActionExecutorHost, ActionExecutionOptions } from './ActionExecutor';

// 上下文增强器
export { ContextEnhancer } from './ContextEnhancer';
export type { IContextEnhancerHost, EnhanceOptions } from './ContextEnhancer';

// 事件总线
export { EventBus, globalEventBus, Events } from './EventBus';
export type { IEventBus, EventHandler, EventUnsubscriber, EventDataTypes } from './EventBus';

// 依赖注入容器
export { ServiceContainer, ServiceLocator, ServiceTokens } from './ServiceContainer';
export type { IServiceContainer, ServiceFactory, ServiceToken } from './ServiceContainer';

// 错误处理
export { 
    ErrorHandler, 
    ErrorSeverity, 
    LocalGPTError, 
    AIRequestError, 
    ConfigurationError, 
    ValidationError,
    errorBoundary 
} from './ErrorHandler';
export type { IErrorHandler, ErrorContext } from './ErrorHandler'; 