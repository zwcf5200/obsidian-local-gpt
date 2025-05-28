import { App, Notice, PluginSettingTab, Setting, ButtonComponent } from "obsidian";
import { DEFAULT_SETTINGS } from "defaultSettings";
import LocalGPT from "./main";
import { LocalGPTAction, LocalGPTSettings } from "./interfaces";
import { waitForAI } from "@obsidian-ai-providers/sdk";
import { clearTagCache } from "./tagManager";

// 为防止类型错误，显式声明LocalGPT接口
declare module "./main" {
	export default interface LocalGPT {
		settings: LocalGPTSettings;
		saveSettings(): Promise<void>;
		refreshTagCache(forceRefresh: boolean): Promise<void>;
	}
}

const SEPARATOR = "✂️";

function escapeTitle(title?: string) {
	if (!title) {
		return "";
	}

	return title
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

// 辅助函数，给按钮添加样式类
function addButtonClasses(button: ButtonComponent, ...classes: string[]): ButtonComponent {
	// 获取按钮元素并添加类
	if (button.buttonEl) {
		classes.forEach(cls => {
			button.buttonEl.addClass(cls);
		});
	}
	return button;
}

export class LocalGPTSettingTab extends PluginSettingTab {
	plugin: LocalGPT;
	editEnabled = false;
	editExistingAction?: LocalGPTAction;
	modelsOptions: Record<string, string> = {};
	changingOrder = false;

	constructor(app: App, plugin: LocalGPT) {
		super(app, plugin);
		this.plugin = plugin;
	}

	async display(): Promise<void> {
		const { containerEl } = this;

		containerEl.empty();

		try {
			// 创建主设置区域标题
			containerEl.createEl("h2", { 
				text: "本地 GPT 设置",
				cls: "local-gpt-settings-header" 
			});
			
			// 创建AI提供商设置区域
			const aiProviderSection = containerEl.createDiv({
				cls: "local-gpt-settings-section"
			});
			
			aiProviderSection.createEl("h3", { 
				text: "AI 提供商配置" 
			});

			const aiProvidersWaiter = await waitForAI();
			const aiProvidersResponse = await aiProvidersWaiter.promise;

			const providers = aiProvidersResponse.providers.reduce(
				(
					acc: Record<string, string>,
					provider: { id: string; name: string; model?: string },
				) => ({
					...acc,
					[provider.id]: provider.model
						? [provider.name, provider.model].join(" ~ ")
						: provider.name,
				}),
				{
					"": "",
				},
			);

			new Setting(aiProviderSection)
				.setHeading()
				.setName("主要 AI 提供商")
				.setDesc("选择默认使用的AI提供商")
				.setClass("ai-providers-select")
				.addDropdown((dropdown) =>
					dropdown
						.addOptions(providers)
						.setValue(String(this.plugin.settings.aiProviders.main))
						.onChange(async (value) => {
							this.plugin.settings.aiProviders.main = value;
							await this.plugin.saveSettings();
							await this.display();
						}),
				);

			new Setting(aiProviderSection)
				.setName("嵌入向量 AI 提供商")
				.setDesc("可选。用于增强上下文功能")
				.setClass("ai-providers-select")
				.addDropdown((dropdown) =>
					dropdown
						.addOptions(providers)
						.setValue(
							String(this.plugin.settings.aiProviders.embedding),
						)
						.onChange(async (value) => {
							this.plugin.settings.aiProviders.embedding = value;
							await this.plugin.saveSettings();
							await this.display();
						}),
				);

			new Setting(aiProviderSection)
				.setName("视觉 AI 提供商")
				.setClass("ai-providers-select")
				.setDesc(
					"可选。用于处理图像。如未设置，将使用主要 AI 提供商。",
				)
				.addDropdown((dropdown) =>
					dropdown
						.addOptions(providers)
						.setValue(
							String(this.plugin.settings.aiProviders.vision),
						)
						.onChange(async (value) => {
							this.plugin.settings.aiProviders.vision = value;
							await this.plugin.saveSettings();
							await this.display();
						}),
				);
			
			// 创建基本设置区域
			const generalSection = containerEl.createDiv({
				cls: "local-gpt-settings-section"
			});
			
			generalSection.createEl("h3", { 
				text: "基本设置" 
			});

			new Setting(generalSection)
				.setName("创造力水平")
				.setDesc("控制AI生成内容的多样性和创造性")
				.addDropdown((dropdown) => {
					dropdown
						.addOption("", "⚪ 无")
						.addOptions({
							low: "️💡 低",
							medium: "🎨 中等",
							high: "🚀 高",
						})
						.setValue(
							String(this.plugin.settings.defaults.creativity) ||
								"",
						)
						.onChange(async (value) => {
							this.plugin.settings.defaults.creativity = value;
							await this.plugin.saveSettings();
							await this.display();
						});
				});

			new Setting(generalSection)
				.setName("显示模型信息")
				.setDesc("控制是否在输出中默认显示模型名称和时间戳")
				.addToggle((toggle) => {
					toggle
						.setValue(this.plugin.settings.defaults.showModelInfo)
						.onChange(async (value) => {
							this.plugin.settings.defaults.showModelInfo = value;
							await this.plugin.saveSettings();
						});
				});

			new Setting(generalSection)
				.setName("显示性能数据")
				.setDesc("控制是否在输出中默认显示Token数量和处理时间等性能数据")
				.addToggle((toggle) => {
					toggle
						.setValue(this.plugin.settings.defaults.showPerformance)
						.onChange(async (value) => {
							this.plugin.settings.defaults.showPerformance = value;
							await this.plugin.saveSettings();
						});
				});
				
			new Setting(generalSection)
				.setName("默认动作")
				.setDesc("选择需要快速访问的默认动作，用于命令面板中的快速执行")
				.addDropdown((dropdown) => {
					// 添加空选项
					dropdown.addOption("", "- 无默认动作 -");
					
					// 添加所有动作作为选项
					this.plugin.settings.actions.forEach(action => {
						dropdown.addOption(action.name, action.name);
					});
					
					// 设置当前值
					dropdown.setValue(this.plugin.settings.defaults.defaultAction || "");
					
					// 监听变化
					dropdown.onChange(async (value) => {
						this.plugin.settings.defaults.defaultAction = value || null;
						await this.plugin.saveSettings();
					});
				});

			// 添加标签管理设置部分
			const tagSection = containerEl.createDiv({
				cls: "local-gpt-settings-section"
			});
			
			tagSection.createEl("h3", { 
				text: "标签管理" 
			});
			
			// 启用标签缓存
			new Setting(tagSection)
				.setName("启用标签缓存")
				.setDesc("启用标签缓存可以提高模板变量渲染速度，但可能会占用额外内存")
				.addToggle((toggle) => {
					toggle
						.setValue(this.plugin.settings.tags.cacheEnabled)
						.onChange(async (value) => {
							this.plugin.settings.tags.cacheEnabled = value;
							if (!value) {
								// 如果禁用缓存，清除现有缓存
								clearTagCache();
							}
							await this.plugin.saveSettings();
						});
				});
				
			// 缓存更新间隔
			new Setting(tagSection)
				.setName("缓存更新间隔（分钟）")
				.setDesc("设置标签缓存自动刷新的时间间隔")
				.addSlider((slider) => {
					slider
						.setLimits(5, 240, 5)
						.setValue(this.plugin.settings.tags.cacheUpdateInterval / 60000)
						.setDynamicTooltip()
						.onChange(async (value) => {
							this.plugin.settings.tags.cacheUpdateInterval = value * 60000;
							await this.plugin.saveSettings();
						});
				});
			
			// 排除的文件夹
			new Setting(tagSection)
				.setName("排除的文件夹")
				.setDesc("不包含在标签统计中的文件夹路径，每行一个")
				.addTextArea((textarea) => {
					textarea
						.setValue(this.plugin.settings.tags.excludeFolders.join("\n"))
						.onChange(async (value) => {
							// 分割文本为数组，过滤空行
							const folders = value.split("\n").filter(line => line.trim() !== "");
							this.plugin.settings.tags.excludeFolders = folders;
							await this.plugin.saveSettings();
						});
					
					// 设置文本区域样式
					textarea.inputEl.rows = 4;
					textarea.inputEl.cols = 50;
				});
			
			// 手动刷新标签缓存按钮
			new Setting(tagSection)
				.setName("刷新标签缓存")
				.setDesc("手动刷新标签缓存，获取最新的标签统计信息")
				.addButton((button) => {
					button
						.setButtonText("刷新缓存")
						.setCta()
						.onClick(async () => {
							button.setButtonText("正在刷新...");
							button.setDisabled(true);
							
							try {
								await this.plugin.refreshTagCache(true);
								new Notice("标签缓存已刷新");
							} catch (error) {
								console.error("刷新标签缓存失败", error);
								new Notice("刷新标签缓存失败: " + (error?.message || "未知错误"));
							} finally {
								button.setButtonText("刷新缓存");
								button.setDisabled(false);
							}
						});
				});

		} catch (error) {
			console.error(error);
		}

		const editingAction: LocalGPTAction = this.editExistingAction || {
			name: "",
			prompt: "",
			temperature: undefined,
			system: "",
			replace: false,
		};

		const sharingActionsMapping = {
			name: "名称: ",
			system: "系统提示: ",
			prompt: "用户提示: ",
			replace: "替换文本: ",
			model: "模型: ",
		};

		// 创建动作设置区域
		const actionSection = containerEl.createDiv({
			cls: "local-gpt-settings-section"
		});
		
		actionSection.createEl("h3", { 
			text: "动作管理" 
		});

		if (!this.editEnabled) {
			const quickAdd = new Setting(actionSection)
				.setName("快速添加")
				.setDesc("")
				.addText((text) => {
					text.inputEl.style.minWidth = "100%";
					text.setPlaceholder("粘贴动作配置");
					text.onChange(async (value) => {
						const quickAddAction: LocalGPTAction = value
							.split(SEPARATOR)
							.map((part) => part.trim())
							.reduce((acc, part) => {
								const foundMatchKey = Object.keys(
									sharingActionsMapping,
								).find((key) => {
									return part.startsWith(
										sharingActionsMapping[
											key as keyof typeof sharingActionsMapping
										],
									);
								});

								if (foundMatchKey) {
									// @ts-ignore
									acc[foundMatchKey] = part.substring(
										sharingActionsMapping[
											foundMatchKey as keyof typeof sharingActionsMapping
										].length,
										part.length,
									);
								}

								return acc;
							}, {} as LocalGPTAction);

						if (quickAddAction.name) {
							await this.addNewAction(quickAddAction);
							text.setValue("");
							this.display();
						}
					});
				});

			quickAdd.descEl.innerHTML = `您可以分享或获取更多动作配置 <a href="https://github.com/pfrankov/obsidian-local-gpt/discussions/2">从社区</a>。<br/><strong>注意:</strong> 如果已存在同名动作，将会被覆盖。`;

			new Setting(actionSection)
				.setName("手动添加")
				.addButton((button) => {
					// 使用辅助函数添加类
					addButtonClasses(button, "local-gpt-button");
					button
						.setIcon("plus")
						.onClick(async () => {
							this.editEnabled = true;
							this.editExistingAction = undefined;
							this.display();
						});
				});
		} else {
			const editSection = containerEl.createDiv({
				cls: "local-gpt-settings-section"
			});
			
			editSection.createEl("h3", { 
				text: this.editExistingAction ? "编辑动作" : "新建动作" 
			});
			
			new Setting(editSection).setName("动作名称").addText((text) => {
				editingAction?.name && text.setValue(editingAction.name);
				text.inputEl.style.minWidth = "100%";
				text.setPlaceholder("输入动作名称");
				text.onChange(async (value) => {
					editingAction.name = value;
				});
			});

			new Setting(editSection)
				.setName("系统提示词")
				.setDesc("可选，用于设置AI的角色和行为")
				.addTextArea((text) => {
					editingAction?.system &&
						text.setValue(editingAction.system);
					text.inputEl.style.minWidth = "100%";
					text.inputEl.style.minHeight = "6em";
					text.inputEl.style.resize = "vertical";
					text.setPlaceholder("你是一个有帮助的助手。");
					text.onChange(async (value) => {
						editingAction.system = value;
					});
				});

			const promptSetting = new Setting(editSection)
				.setName("用户提示词")
				.setDesc("")
				.addTextArea((text) => {
					editingAction?.prompt &&
						text.setValue(editingAction.prompt);
					text.inputEl.style.minWidth = "100%";
					text.inputEl.style.minHeight = "6em";
					text.inputEl.style.resize = "vertical";
					text.setPlaceholder("");
					text.onChange(async (value) => {
						editingAction.prompt = value;
					});
				});

			promptSetting.descEl.innerHTML = `请阅读<br/><a href="https://github.com/pfrankov/obsidian-local-gpt/blob/master/docs/prompt-templating.md">提示词模板文档</a><br/>以了解如何自定义提示词`;

			new Setting(editSection)
				.setName("替换选中文本")
				.setDesc(
					"勾选后，AI 生成的内容将替换编辑器中选中的文本",
				)
				.addToggle((component) => {
					editingAction?.replace &&
						component.setValue(editingAction.replace);
					component.onChange(async (value) => {
						editingAction.replace = value;
					});
				});

			const actionButtonsRow = new Setting(editSection).setName("");

			if (this.editExistingAction) {
				actionButtonsRow.addButton((button) => {
					button.buttonEl.style.marginRight = "2em";
					let btn = button
						.setButtonText("删除")
						.onClick(async () => {
							if (!button.buttonEl.hasClass("mod-warning")) {
								button.setClass("mod-warning");
								return;
							}

							this.plugin.settings.actions =
								this.plugin.settings.actions.filter(
									(innerAction) => innerAction !== editingAction,
								);
							await this.plugin.saveSettings();
							this.editExistingAction = undefined;
							this.editEnabled = false;
							this.display();
						});
						
					// 使用辅助函数添加类
					addButtonClasses(btn, "local-gpt-button", "local-gpt-button-danger");
				});
			}

			actionButtonsRow
				.addButton((button) => {
					let btn = button
						.setButtonText("取消")
						.onClick(async () => {
							this.editEnabled = false;
							this.editExistingAction = undefined;
							this.display();
						});
						
					// 使用辅助函数添加类
					addButtonClasses(btn, "local-gpt-button");
				})
				.addButton((button) => {
					let btn = button
						.setCta()
						.setButtonText("保存")
						.onClick(async () => {
							if (!editingAction.name) {
								new Notice(
									"请输入动作名称",
								);
								return;
							}

							if (!this.editExistingAction) {
								if (
									this.plugin.settings.actions.find(
										(action) =>
											action.name === editingAction.name,
									)
								) {
									new Notice(
										`已存在名为"${editingAction.name}"的动作`,
									);
									return;
								}

								await this.addNewAction(editingAction);
							} else {
								if (
									this.plugin.settings.actions.filter(
										(action) =>
											action.name === editingAction.name,
									).length > 1
								) {
									new Notice(
										`已存在名为"${editingAction.name}"的动作`,
									);
									return;
								}

								const index =
									this.plugin.settings.actions.findIndex(
										(innerAction) =>
											innerAction === editingAction,
									);

								this.plugin.settings.actions[index] =
									editingAction;
							}

							await this.plugin.saveSettings();

							this.editEnabled = false;
							this.editExistingAction = undefined;
							this.display();
						});
						
					// 使用辅助函数添加类
					addButtonClasses(btn, "local-gpt-button", "local-gpt-button-primary");
				});
		}

		if (!this.editEnabled) {
			const actionsListContainer = containerEl.createDiv();
			actionsListContainer.createEl("h4", { 
				text: "动作列表",
				cls: "local-gpt-settings-header" 
			});
	
			this.plugin.settings.actions.forEach((action, actionIndex) => {
				const sharingString = [
					action.name && `${sharingActionsMapping.name}${action.name}`,
					action.system &&
						`${sharingActionsMapping.system}${action.system}`,
					action.prompt &&
						`${sharingActionsMapping.prompt}${action.prompt}`,
					action.replace &&
						`${sharingActionsMapping.replace}${action.replace}`,
				]
					.filter(Boolean)
					.join(` ${SEPARATOR}\n`);
	
				if (!this.changingOrder) {
					const actionItemDiv = actionsListContainer.createDiv({
						cls: "local-gpt-action-item" + (this.plugin.settings.defaults.defaultAction === action.name ? " local-gpt-action-item-selected" : "")
					});
					
					const actionRow = new Setting(actionItemDiv)
						.setName(action.name)
						.setDesc("");
						
					actionRow
						.addButton((button) => {
							let btn = button
								.setIcon("copy")
								.setTooltip("复制")
								.onClick(async () => {
									navigator.clipboard.writeText(sharingString);
									new Notice("已复制");
								});
								
							// 使用辅助函数添加类
							addButtonClasses(btn, "local-gpt-button");
						})
						.addButton((button) => {
							let btn = button
								.setButtonText("编辑")
								.onClick(async () => {
									this.editEnabled = true;
									this.editExistingAction =
										this.plugin.settings.actions.find(
											(innerAction) =>
												innerAction.name == action.name,
										);
									this.display();
								});
								
							// 使用辅助函数添加类
							addButtonClasses(btn, "local-gpt-button");
						});
	
					const systemTitle = escapeTitle(action.system);
	
					const promptTitle = escapeTitle(action.prompt);
	
					actionRow.descEl.innerHTML = [
						action.system &&
							`<div title="${systemTitle}" style="text-overflow: ellipsis; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">
								<b>${sharingActionsMapping.system}</b>${action.system}</div>`,
						action.prompt &&
							`<div title="${promptTitle}" style="text-overflow: ellipsis; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">
								<b>${sharingActionsMapping.prompt}</b>${action.prompt}
							</div>`,
					]
						.filter(Boolean)
						.join("<br/>\n");
				} else {
					const actionItemDiv = actionsListContainer.createDiv({
						cls: "local-gpt-action-item"
					});
					
					const actionRow = new Setting(actionItemDiv)
						.setName(action.name)
						.setDesc("");
	
					if (actionIndex > 0) {
						actionRow.addButton((button) => {
							let btn = button
								.setIcon("arrow-up")
								.setTooltip("上移")
								.onClick(async () => {
									const prev =
										this.plugin.settings.actions[actionIndex - 1];
									this.plugin.settings.actions[actionIndex - 1] =
										action;
									this.plugin.settings.actions[actionIndex] = prev;
									await this.plugin.saveSettings();
									this.display();
								});
								
							// 使用辅助函数添加类
							addButtonClasses(btn, "local-gpt-button");
						});
					}
					if (actionIndex < this.plugin.settings.actions.length - 1) {
						actionRow.addButton((button) => {
							let btn = button
								.setIcon("arrow-down")
								.setTooltip("下移")
								.onClick(async () => {
									const next =
										this.plugin.settings.actions[actionIndex + 1];
									this.plugin.settings.actions[actionIndex + 1] =
										action;
									this.plugin.settings.actions[actionIndex] = next;
									await this.plugin.saveSettings();
									this.display();
								});
								
							// 使用辅助函数添加类
							addButtonClasses(btn, "local-gpt-button");
						});
					}
				}
			});
	
			if (this.plugin.settings.actions.length) {
				new Setting(actionsListContainer)
					.setName("")
					.addButton((button) => {
						this.changingOrder && button.setCta();
						let btn = button
							.setButtonText(this.changingOrder ? "完成排序" : "更改顺序")
							.onClick(async () => {
								this.changingOrder = !this.changingOrder;
								this.display();
							});
							
						// 使用辅助函数添加类
						addButtonClasses(btn, "local-gpt-button");
						if (this.changingOrder) {
							addButtonClasses(btn, "local-gpt-button-primary");
						}
					});
			}
	
			// 危险区域
			const dangerZone = containerEl.createDiv({
				cls: "local-gpt-settings-section"
			});
			
			dangerZone.createEl("h4", { 
				text: "危险区域",
				cls: "local-gpt-settings-header"
			});
			
			new Setting(dangerZone)
				.setName("重置动作")
				.setDesc(
					"🚨 将所有动作重置为默认值。此操作不可撤销，将删除所有自定义动作。",
				)
				.addButton((button) => {
					let btn = button
						.setClass("mod-warning")
						.setButtonText("重置")
						.onClick(async () => {
							button.setDisabled(true);
							button.buttonEl.setAttribute("disabled", "true");
							button.buttonEl.classList.remove("mod-warning");
							this.plugin.settings.actions = DEFAULT_SETTINGS.actions;
							await this.plugin.saveSettings();
							this.display();
						});
						
					// 使用辅助函数添加类
					addButtonClasses(btn, "local-gpt-button", "local-gpt-button-danger");
				});
		}
	}

	async addNewAction(editingAction: LocalGPTAction) {
		const alreadyExistingActionIndex =
			this.plugin.settings.actions.findIndex(
				(action) => action.name === editingAction.name,
			);

		if (alreadyExistingActionIndex >= 0) {
			this.plugin.settings.actions[alreadyExistingActionIndex] =
				editingAction;
			new Notice(`已更新"${editingAction.name}"动作`);
		} else {
			this.plugin.settings.actions = [
				editingAction,
				...this.plugin.settings.actions,
			];
			new Notice(`已添加"${editingAction.name}"动作`);
		}
		await this.plugin.saveSettings();
	}
} 