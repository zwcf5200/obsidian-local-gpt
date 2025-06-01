# LocalGPT 模块化架构图

## 整体架构

```mermaid
graph TB
    subgraph "Obsidian Plugin Layer"
        A[LocalGPT Plugin<br/>main.ts - 789行]
    end
    
    subgraph "Architecture Layer 架构层"
        B[EventBus<br/>事件总线]
        C[ServiceContainer<br/>依赖注入容器]
        D[ErrorHandler<br/>错误处理器]
    end
    
    subgraph "Core Modules 核心模块"
        E[ActionExecutor<br/>动作执行器]
        F[ContextEnhancer<br/>上下文增强器]
    end
    
    subgraph "Service Layer 服务层"
        G[AIServiceManager<br/>AI服务管理器]
    end
    
    subgraph "UI Components UI组件"
        H[ModelSuggestor<br/>模型建议器]
        I[ActionSuggestor<br/>动作建议器]
        J[StatusBarManager<br/>状态栏管理器]
    end
    
    subgraph "Utils 工具层"
        K[textUtils<br/>文本处理]
        L[tokenUtils<br/>Token估算]
        M[modelUtils<br/>模型检测]
    end
    
    subgraph "External 外部依赖"
        N[Obsidian API]
        O[AI Providers SDK]
        P[RAG System]
    end
    
    A --> B
    A --> C
    A --> D
    
    C --> E
    C --> F
    C --> G
    C --> H
    C --> I
    C --> J
    
    E --> G
    E --> K
    E --> L
    E --> M
    
    F --> P
    
    G --> O
    
    B -.-> E
    B -.-> F
    B -.-> G
    
    D -.-> B
    
    A --> N
```

## 事件流

```mermaid
sequenceDiagram
    participant User
    participant Plugin
    participant EventBus
    participant ActionExecutor
    participant AIService
    participant ErrorHandler
    
    User->>Plugin: 执行动作
    Plugin->>EventBus: emit(AI_REQUEST_START)
    Plugin->>ActionExecutor: executeAction()
    ActionExecutor->>AIService: 准备并执行请求
    
    alt 成功
        AIService-->>ActionExecutor: 返回结果
        ActionExecutor->>EventBus: emit(TOKEN_USAGE)
        ActionExecutor->>EventBus: emit(PERFORMANCE_METRIC)
        ActionExecutor-->>Plugin: 完成
        Plugin->>EventBus: emit(AI_REQUEST_COMPLETE)
    else 失败
        AIService-->>ActionExecutor: 抛出错误
        ActionExecutor->>ErrorHandler: handle(error)
        ErrorHandler->>EventBus: emit(AI_REQUEST_ERROR)
        ErrorHandler->>User: 显示友好错误消息
    end
```

## 依赖注入结构

```mermaid
graph LR
    subgraph "Service Container"
        A[App<br/>Singleton]
        B[Plugin<br/>Singleton]
        C[Settings<br/>Singleton]
        D[EventBus<br/>Singleton]
        E[ErrorHandler<br/>Singleton]
        F[AIServiceManager<br/>Singleton]
        G[StatusBarManager<br/>Singleton]
        H[ActionExecutor<br/>Singleton]
        I[ContextEnhancer<br/>Singleton]
    end
    
    F --> A
    F --> C
    
    G --> B
    
    H --> B
    H --> F
    
    I --> B
    
    E --> D
```

## 模块职责

### 架构层
- **EventBus**: 发布-订阅模式，解耦模块间通信
- **ServiceContainer**: 管理服务生命周期，处理依赖注入
- **ErrorHandler**: 统一错误处理，用户友好通知

### 核心模块
- **ActionExecutor**: 执行 AI 动作的完整流程
- **ContextEnhancer**: RAG 功能，增强上下文

### 服务层
- **AIServiceManager**: 管理 AI Provider 交互

### UI 组件
- **ModelSuggestor**: "@" 触发的模型选择
- **ActionSuggestor**: ":" 触发的动作选择
- **StatusBarManager**: 进度显示和状态管理

### 工具层
- **textUtils**: 文本处理和格式化
- **tokenUtils**: Token 使用估算
- **modelUtils**: 模型能力检测

## 代码统计

| 模块 | 文件数 | 代码行数 |
|------|--------|----------|
| 主文件 (main.ts) | 1 | 789 |
| 架构层 | 3 | ~900 |
| 核心模块 | 2 | ~740 |
| 服务层 | 1 | ~300 |
| UI 组件 | 3 | ~340 |
| 工具层 | 3 | ~180 |
| **总计** | **13** | **~3,249** |

## 重构成果

- **代码组织**: 从单一文件拆分为 13 个模块
- **main.ts 精简**: 从 1634 行减少到 789 行（减少 51.7%）
- **架构升级**: 从单体架构升级为模块化、事件驱动架构
- **可维护性**: 每个模块职责单一，易于理解和修改
- **可扩展性**: 通过事件和依赖注入，便于添加新功能 