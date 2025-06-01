/*
 * LocalGPT - 支持从AI Providers SDK获取Token消耗和性能数据
 * 
 * 本文件使用了AI Providers SDK的Token消耗和性能指标获取功能。
 * 请确保您使用的SDK版本≥1.4.0，此版本中IAIProvidersService接口正式添加了getLastRequestMetrics方法。
 * 
 * getLastRequestMetrics方法参数说明：
 * - providerId: string - 提供商ID，用于获取特定提供商的指标
 * 
 * 返回：
 * - IUsageMetrics对象或null（如果没有记录任何请求）
 */

import {
	Editor,
	Menu,
	Notice,
	Plugin,
	requestUrl,
	EditorSuggest,
	EditorPosition,
	TFile,
	EditorSuggestTriggerInfo,
	EditorSuggestContext,
	App, // For constructor and app property
	Scope, // For constructor of PopoverSuggest
	PopoverSuggest, // To extend from
	Instruction, // For setInstructions
} from "obsidian";
import { LocalGPTSettingTab } from "./LocalGPTSettingTab";
import { CREATIVITY, DEFAULT_SETTINGS } from "defaultSettings";
import { spinnerPlugin } from "./spinnerPlugin";
import { LocalGPTAction, LocalGPTSettings } from "./interfaces";

import {
	createVectorStore,
	getLinkedFiles,
	queryVectorStore,
	startProcessing,
} from "./rag";
import { fileCache } from "./indexedDB";
import {
	initAI,
	waitForAI,
	IAIProvider,
	IAIProvidersService,
	AICapability,
	IAIProvidersExecuteParams,
	ITokenUsage,
	ReportUsageCallback,
	IUsageMetrics,
} from "@obsidian-ai-providers/sdk";
import {
	getAllTagStats,
	clearTagCache,
} from "./tagManager";

// 导入工具函数
import {
	processGeneratedText,
	removeThinkingTags,
	extractImageLinks,
	estimateTokenUsage,
	isVisionCapableModel,
	getCapabilityIcons,
	preparePrompt,
	logger
} from "./utils/index";

// 导入 UI 组件
import {
	ModelSuggestor,
	ActionSuggestor,
	StatusBarManager
} from "./ui/index";

// 导入服务
import {
	AIServiceManager,
	TokenData
} from "./services/index";

// 导入核心功能和架构组件
import {
	ActionExecutor,
	ContextEnhancer,
	// 架构组件
	EventBus,
	globalEventBus,
	Events,
	ServiceContainer,
	ServiceLocator,
	ServiceTokens,
	ErrorHandler,
	ErrorSeverity,
	IErrorHandler,
	IEventBus,
	IServiceContainer
} from "./core/index";

export default class LocalGPT extends Plugin {
	settings: LocalGPTSettings; // 插件设置
	abortControllers: AbortController[] = []; // 用于管理异步操作的中止控制器数组
	updatingInterval: number; // 更新检查的定时器 ID
	private statusBarManager: StatusBarManager; // 状态栏管理器
	aiServiceManager: AIServiceManager; // AI 服务管理器 (改为公共属性以符合接口)
	private actionExecutor: ActionExecutor; // 动作执行器
	private contextEnhancer: ContextEnhancer; // 上下文增强器

	// 架构组件
	private container: IServiceContainer; // 依赖注入容器
	private eventBus: IEventBus; // 事件总线
	private errorHandler: IErrorHandler; // 错误处理器

	editorSuggest?: ModelSuggestor; // 用于存储 "@" 模型建议器的实例
	actionSuggest?: ActionSuggestor; // 用于存储 "::" 动作建议器的实例

	// 插件加载时的生命周期方法
	async onload() {
		// 初始化架构组件
		this.initializeArchitecture();

		// 初始化 AI 服务
		initAI(this.app, this, async () => {
			await this.loadSettings(); // 加载设置
			
			// 注册服务到容器
			this.registerServices();
			
			// 初始化核心服务
			await this.initializeServices();
			
			// 添加设置页面标签
			this.addSettingTab(new LocalGPTSettingTab(this.app, this));
			this.reload(); // 设置插件配置

			// 等待工作区准备就绪后初始化
			this.app.workspace.onLayoutReady(async () => {
				// 初始化文件缓存
				// @ts-ignore
				await fileCache.init(this.app.appId);

				// 延迟5秒后检查更新
				window.setTimeout(() => {
					this.checkUpdates();
				}, 5000);
			});

			// 注册编辑器扩展插件（旋转加载动画）
			this.registerEditorExtension(spinnerPlugin);
			this.initializeStatusBar(); // 初始化状态栏

			// 注册模型建议器 (用于 "@" 触发)
			this.editorSuggest = new ModelSuggestor(this);
			this.registerEditorSuggest(this.editorSuggest);
			// 注册动作建议器 (用于 "::" 触发)
			this.actionSuggest = new ActionSuggestor(this);
			this.registerEditorSuggest(this.actionSuggest);
			
			// 设置事件监听
			this.setupEventListeners();
		});
	}

	/**
	 * 初始化架构组件
	 */
	private initializeArchitecture(): void {
		// 创建依赖注入容器
		this.container = new ServiceContainer();
		ServiceLocator.setContainer(this.container);
		
		// 使用全局事件总线
		this.eventBus = globalEventBus;
		
		// 创建错误处理器
		this.errorHandler = new ErrorHandler(this.eventBus);
	}

	/**
	 * 注册服务到容器
	 */
	private registerServices(): void {
		// 注册基础服务
		this.container.registerInstance(ServiceTokens.App, this.app);
		this.container.registerInstance(ServiceTokens.Plugin, this);
		this.container.registerInstance(ServiceTokens.Settings, this.settings);
		this.container.registerInstance(ServiceTokens.EventBus, this.eventBus);
		this.container.registerInstance(ServiceTokens.ErrorHandler, this.errorHandler);
		
		// 注册服务工厂
		this.container.register(ServiceTokens.AIServiceManager, 
			(container) => new AIServiceManager(
				container.get(ServiceTokens.App),
				container.get(ServiceTokens.Settings)
			)
		);
		
		this.container.register(ServiceTokens.StatusBarManager,
			(container) => new StatusBarManager(container.get(ServiceTokens.Plugin))
		);
		
		this.container.register(ServiceTokens.ActionExecutor,
			(container) => new ActionExecutor(container.get(ServiceTokens.Plugin))
		);
		
		this.container.register(ServiceTokens.ContextEnhancer,
			(container) => new ContextEnhancer(container.get(ServiceTokens.Plugin))
		);
	}

	/**
	 * 初始化服务
	 */
	private async initializeServices(): Promise<void> {
		// 从容器获取服务
		this.aiServiceManager = this.container.get(ServiceTokens.AIServiceManager);
		this.statusBarManager = this.container.get(ServiceTokens.StatusBarManager);
		this.actionExecutor = this.container.get(ServiceTokens.ActionExecutor);
		this.contextEnhancer = this.container.get(ServiceTokens.ContextEnhancer);
		
		// 发送初始化完成事件
		this.eventBus.emit(Events.SETTINGS_CHANGED, { settings: this.settings });
	}

	/**
	 * 设置事件监听
	 */
	private setupEventListeners(): void {
		// 监听 AI 请求错误
		this.eventBus.on(Events.AI_REQUEST_ERROR, (data) => {
			logger.error('AI 请求错误', data);
		});
		
		// 监听性能指标
		this.eventBus.on(Events.PERFORMANCE_METRIC, (data) => {
			logger.debug('性能指标', data);
		});
		
		// 监听 Token 使用
		this.eventBus.on(Events.TOKEN_USAGE, (data) => {
			logger.debug('Token 使用', data);
		});
	}

	// 初始化状态栏
	private initializeStatusBar() {
		// 状态栏管理器已通过容器初始化
	}

	// 处理 AI 生成的文本
	// 移除思考标签 <think>...</think> 并格式化输出
	processText(text: string, selectedText: string) {
		return processGeneratedText(text, selectedText);
	}

	// 添加命令面板命令
	private addCommands() {
		// 添加右键上下文菜单命令
		this.addCommand({
			id: "context-menu",
			name: "显示操作菜单",
			editorCallback: (editor: Editor) => {
				// @ts-expect-error, not typed
				const editorView = editor.cm;

				const cursorPositionFrom = editor.getCursor("from");
				const cursorPositionTo = editor.getCursor("to");

				const contextMenu = new Menu();

				// 将所有动作添加到上下文菜单
				this.settings.actions.forEach((action) => {
					contextMenu.addItem((item) => {
						item.setTitle(action.name).onClick(
							this.runAction.bind(this, action, editor),
						);
					});
				});

				// 获取光标位置并显示菜单
				const fromRect = editorView.coordsAtPos(
					editor.posToOffset(cursorPositionFrom),
				);
				const toRect = editorView.coordsAtPos(
					editor.posToOffset(cursorPositionTo),
				);
				contextMenu.showAtPosition({
					x: fromRect.left,
					y: toRect.top + (editorView.defaultLineHeight || 0),
				});
			},
		});
		
		// 添加执行默认动作的命令
		this.addCommand({
			id: "run-default-action",
			name: "执行默认动作",
			editorCallback: (editor: Editor) => {
				// 获取默认动作名称
				const defaultActionName = this.settings.defaults.defaultAction;
				
				if (!defaultActionName) {
					new Notice("未设置默认动作，请在设置中配置");
					return;
				}
				
				// 查找默认动作
				const defaultAction = this.settings.actions.find(
					action => action.name === defaultActionName
				);
				
				if (!defaultAction) {
					new Notice(`未找到名为"${defaultActionName}"的动作`);
					return;
				}
				
				// 执行默认动作
				this.runAction(defaultAction, editor);
			}
		});

		// 为每个动作添加快速访问命令
		this.settings.actions.forEach((action, index) => {
			this.addCommand({
				id: `quick-access-${index + 1}`,
				name: `${index + 1} | ${action.name}`,
				editorCallback: (editor: Editor) => {
					this.runAction(action, editor);
				},
			});
		});
	}

	// 执行指定的 AI 动作
	async runAction(action: LocalGPTAction, editor: Editor) {
		// 发送请求开始事件
		this.eventBus.emit(Events.AI_REQUEST_START, {
			action: action.name,
			provider: this.settings.aiProviders.main || 'unknown',
			timestamp: Date.now()
		});
		
		const startTime = Date.now();
		
		try {
			await this.actionExecutor.executeAction({
				action,
				editor
			});
			
			// 发送请求完成事件
			this.eventBus.emit(Events.AI_REQUEST_COMPLETE, {
				action: action.name,
				provider: this.settings.aiProviders.main || 'unknown',
				duration: Date.now() - startTime,
				success: true
			});
		} catch (error) {
			// 错误由 ActionExecutor 内部处理
			// 这里只发送完成事件
			this.eventBus.emit(Events.AI_REQUEST_COMPLETE, {
				action: action.name,
				provider: this.settings.aiProviders.main || 'unknown',
				duration: Date.now() - startTime,
				success: false
			});
			throw error;
		}
	}

	// 使用相关文档内容增强上下文
	// 通过向量存储和语义搜索找到相关内容
	async enhanceWithContext(
		selectedText: string,
		aiProviders: IAIProvidersService,
		aiProvider: IAIProvider | undefined,
		abortController: AbortController,
	): Promise<string> {
		const activeFile = this.app.workspace.getActiveFile();
		
		// 发送文档处理开始事件
		this.eventBus.emit(Events.DOCUMENT_PROCESS_START, {
			fileCount: 1,
			timestamp: Date.now()
		});
		
		try {
			const result = await this.contextEnhancer.enhanceWithContext({
				selectedText,
				activeFile,
				aiProviders,
				aiProvider,
				abortController
			});
			
			// 发送文档处理完成事件
			this.eventBus.emit(Events.DOCUMENT_PROCESS_COMPLETE, {
				success: true,
				resultLength: result.length
			});
			
			return result;
		} catch (error) {
			// 发送文档处理完成事件（失败）
			this.eventBus.emit(Events.DOCUMENT_PROCESS_COMPLETE, {
				success: false,
				error: error
			});
			throw error;
		}
	}

	// 插件卸载时的清理工作
	onunload() {
		document.removeEventListener("keydown", this.escapeHandler); // 移除键盘监听
		window.clearInterval(this.updatingInterval); // 清除更新检查定时器
		
		// 清理架构组件
		this.eventBus.clear();
		this.container.clear();
		
		if (this.statusBarManager) {
			this.statusBarManager.destroy(); // 清理状态栏管理器
		}
	}

	// 加载插件设置并执行必要的数据迁移
	async loadSettings() {
		const loadedData: LocalGPTSettings = await this.loadData();
		let needToSave = false;

		// 数据迁移：处理旧版本设置格式
		if (loadedData) {
			const oldDefaultProviders = {
				ollama: {
					url: "http://localhost:11434",
					defaultModel: "gemma2",
					embeddingModel: "",
					type: "ollama",
				},
				ollama_fallback: {
					url: "http://localhost:11434",
					defaultModel: "gemma2",
					embeddingModel: "",
					type: "ollama",
				},
				openaiCompatible: {
					url: "http://localhost:8080/v1",
					apiKey: "",
					embeddingModel: "",
					type: "openaiCompatible",
				},
				openaiCompatible_fallback: {
					url: "http://localhost:8080/v1",
					apiKey: "",
					embeddingModel: "",
					type: "openaiCompatible",
				},
			};

			if (!loadedData._version || loadedData._version < 1) {
				needToSave = true;

				(loadedData as any).providers = oldDefaultProviders;
				(loadedData as any).providers.ollama.ollamaUrl = (
					loadedData as any
				).ollamaUrl;
				delete (loadedData as any).ollamaUrl;
				(loadedData as any).providers.ollama.defaultModel = (
					loadedData as any
				).defaultModel;
				delete (loadedData as any).defaultModel;
				(loadedData as any).providers.openaiCompatible &&
					((loadedData as any).providers.openaiCompatible.apiKey =
						"");

				loadedData._version = 2;
			}

			if (loadedData._version < 3) {
				needToSave = true;
				(loadedData as any).defaultProvider =
					(loadedData as any).selectedProvider || "ollama";
				delete (loadedData as any).selectedProvider;

				const providers = (loadedData as any).providers;
				if (providers) {
					Object.keys(providers).forEach((key) => {
						providers[key].type = key;
					});
				}

				loadedData._version = 3;
			}

			if (loadedData._version < 4) {
				needToSave = true;
				(loadedData as any).defaults = {
					provider: (loadedData as any).defaultProvider || "ollama",
					fallbackProvider:
						(loadedData as any).fallbackProvider || "",
					creativity: "low",
				};
				delete (loadedData as any).defaultProvider;
				delete (loadedData as any).fallbackProvider;

				loadedData._version = 4;
			}

			if (loadedData._version < 5) {
				needToSave = true;

				const providers = (loadedData as any).providers;
				if (providers) {
					Object.keys(oldDefaultProviders).forEach((provider) => {
						if (providers[provider]) {
							providers[provider].embeddingModel = (
								oldDefaultProviders as any
							)[provider].embeddingModel;
						}
					});
				}

				loadedData._version = 5;
				setTimeout(() => {
					new Notice(
						`🎉 LocalGPT can finally use\ncontext from links!\nCheck the Settings!`,
						0,
					);
				}, 10000);
			}

			if (loadedData._version < 6) {
				needToSave = true;
				const providers = (loadedData as any).providers;
				if (providers) {
					Object.keys(oldDefaultProviders).forEach((provider) => {
						if (providers[provider]?.type === "ollama") {
							providers[provider].url =
								providers[provider].ollamaUrl;
							delete providers[provider].ollamaUrl;
						}
						if (providers[provider]?.type === "openaiCompatible") {
							providers[provider].url =
								providers[provider].url.replace(/\/+$/i, "") +
								"/v1";
						}
					});
				}

				loadedData._version = 6;
			}

			if (loadedData._version < 7) {
				needToSave = true;

				new Notice("️🚨 IMPORTANT! Update Local GPT settings!", 0);

				const aiRequestWaiter = await waitForAI();
				const aiProviders = await aiRequestWaiter.promise;

				loadedData.aiProviders = {
					main: null,
					embedding: null,
					vision: null,
				};

				const oldProviders = (loadedData as any).providers;
				const oldDefaults = (loadedData as any).defaults;

				if (oldProviders && oldDefaults?.provider) {
					const provider = oldDefaults.provider;
					const typesMap: { [key: string]: string } = {
						ollama: "ollama",
						openaiCompatible: "openai",
					};

					const providerConfig = oldProviders[provider];
					if (providerConfig) {
						const type = typesMap[providerConfig.type];

						if (providerConfig.defaultModel) {
							let model = providerConfig.defaultModel;
							if (
								type === "ollama" &&
								!model.endsWith(":latest")
							) {
								model = model + ":latest";
							}

							const id = `id-${Date.now().toString()}`;
							const newProvider = await (
								aiProviders as any
							).migrateProvider({
								id,
								name: `Local GPT ${provider}`,
								apiKey: providerConfig.apiKey,
								url: providerConfig.url,
								type,
								model,
							});

							if (newProvider) {
								loadedData.aiProviders.main = newProvider.id;
							}
						}

						if (providerConfig.embeddingModel) {
							let model = providerConfig.embeddingModel;
							if (
								type === "ollama" &&
								!model.endsWith(":latest")
							) {
								model = model + ":latest";
							}

							const id = `id-${Date.now().toString()}`;
							const newProvider = await (
								aiProviders as any
							).migrateProvider({
								id,
								name: `Local GPT ${provider} embeddings`,
								apiKey: providerConfig.apiKey,
								url: providerConfig.url,
								type,
								model,
							});

							if (newProvider) {
								loadedData.aiProviders.embedding =
									newProvider.id;
							}
						}
					}
				}

				delete (loadedData as any).defaults;
				delete (loadedData as any).providers;

				loadedData._version = 7;
			}
			
			if (loadedData._version < 8) {
				needToSave = true;
				
				// 如果defaults字段存在但没有新增的字段，添加默认值
				if (loadedData.defaults) {
					(loadedData.defaults as any).showModelInfo = true;
					(loadedData.defaults as any).showPerformance = true;
				}
				
				loadedData._version = 8;
			}
		}

		this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);

		if (needToSave) {
			await this.saveData(this.settings);
		}
	}

	// 检查插件更新
	async checkUpdates() {
		try {
			const { json: response } = await requestUrl({
				url: "https://api.github.com/repos/pfrankov/obsidian-local-gpt/releases/latest",
				method: "GET",
				headers: {
					"Content-Type": "application/json",
				},
				contentType: "application/json",
			});

			// 如果有新版本可用，显示通知
			if (response.tag_name !== this.manifest.version) {
				this.errorHandler.notify(`⬆️ Local GPT: 新版本 ${response.tag_name} 可用`, ErrorSeverity.INFO);
			}
		} catch (error) {
			logger.error("检查更新失败:", error);
		}
	}

	// ESC 键处理器：取消所有正在进行的 AI 请求
	escapeHandler = (event: KeyboardEvent) => {
		if (event.key === "Escape") {
			// 发送中止事件
			this.eventBus.emit(Events.AI_REQUEST_ABORT, {
				timestamp: Date.now()
			});
			
			this.abortControllers.forEach(
				(abortControllers: AbortController) => {
					abortControllers.abort();
				},
			);
			this.abortControllers = [];
		}
	};

	// 重新加载插件配置
	reload() {
		this.onunload(); // 先执行清理
		this.addCommands(); // 重新添加命令
		this.abortControllers = [];
		this.updatingInterval = window.setInterval(
			this.checkUpdates.bind(this),
			10800000,
		); // 每3小时检查更新
		document.addEventListener("keydown", this.escapeHandler);
		
		// 发送设置变更事件
		this.eventBus.emit(Events.SETTINGS_CHANGED, { settings: this.settings });
	}

	// 保存设置并重新加载插件
	async saveSettings() {
		await this.saveData(this.settings);
		
		// 更新容器中的设置
		this.container.registerInstance(ServiceTokens.Settings, this.settings);
		
		this.reload();
	}

	// 初始化进度条显示 (改为公共方法以符合接口)
	initializeProgress() {
		this.statusBarManager.initializeProgress();
		this.eventBus.emit(Events.PROGRESS_START);
	}

	// 添加总进度步数 (改为公共方法以符合接口)
	addTotalProgressSteps(steps: number) {
		this.statusBarManager.addTotalProgressSteps(steps);
	}

	// 更新已完成的步数 (改为公共方法以符合接口)
	updateCompletedSteps(steps: number) {
		this.statusBarManager.updateCompletedSteps(steps);
		
		// 发送进度更新事件
		const progress = this.statusBarManager.getProgress();
		this.eventBus.emit(Events.PROGRESS_UPDATE, {
			current: progress.completed,
			total: progress.total
		});
	}

	// 隐藏状态栏并重置进度 (改为公共方法以符合接口)
	hideStatusBar() {
		this.statusBarManager.hide();
		this.eventBus.emit(Events.PROGRESS_COMPLETE);
	}

	// 刷新标签缓存
	async refreshTagCache(forceRefresh: boolean = true) {
		if (this.settings.tags.cacheEnabled) {
			await getAllTagStats(
				this.app,
				this.settings.tags.excludeFolders,
				forceRefresh
			);
			this.settings.tags.lastCacheUpdate = Date.now();
			await this.saveSettings();
		} else {
			clearTagCache();
		}
	}
}
