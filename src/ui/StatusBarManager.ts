/**
 * 状态栏管理器
 * 管理进度条显示和动画
 */

import { Plugin } from "obsidian";

export interface IStatusBarHost {
    app: any;
    addStatusBarItem(): any;
}

export class StatusBarManager {
    private statusBarItem: any;
    private currentPercentage: number = 0;
    private targetPercentage: number = 0;
    private animationFrameId: number | null = null;
    private totalProgressSteps: number = 0;
    private completedProgressSteps: number = 0;
    private animationInterval?: number;
    private lastUpdateTime: number = 0;
    private readonly MIN_UPDATE_INTERVAL = 100; // 最小更新间隔（毫秒）

    constructor(private host: IStatusBarHost) {
        this.statusBarItem = host.addStatusBarItem();
        this.statusBarItem.addClass("local-gpt-status");
        this.statusBarItem.hide();
    }

    // 初始化进度条显示
    initializeProgress() {
        this.totalProgressSteps = 0;
        this.completedProgressSteps = 0;
        this.currentPercentage = 0;
        this.targetPercentage = 0;
        this.statusBarItem.show();
        this.updateStatusBar();
    }

    // 添加总进度步数
    addTotalProgressSteps(steps: number) {
        this.totalProgressSteps += steps;
        this.updateProgressBar();
    }

    // 更新已完成的步数
    updateCompletedSteps(steps: number) {
        this.completedProgressSteps += steps;
        this.updateProgressBar();
    }

    // 更新进度条百分比
    private updateProgressBar() {
        const newTargetPercentage =
            this.totalProgressSteps > 0
                ? Math.round(
                        (this.completedProgressSteps /
                            this.totalProgressSteps) *
                            100,
                    )
                : 0;

        if (this.targetPercentage !== newTargetPercentage) {
            this.targetPercentage = newTargetPercentage;
            if (this.animationFrameId === null) {
                this.animatePercentage();
            }
        }
    }

    // 更新状态栏文本
    private updateStatusBar() {
        this.statusBarItem.setAttr(
            "data-text",
            this.currentPercentage
                ? `✨ Enhancing ${this.currentPercentage}%`
                : "✨ Enhancing",
        );
        this.statusBarItem.setText(` `);
    }

    // 动画显示百分比变化
    private animatePercentage() {
        const startTime = performance.now();
        const duration = 300; // 动画持续时间300ms

        const animate = (currentTime: number) => {
            const elapsedTime = currentTime - startTime;
            const progress = Math.min(elapsedTime / duration, 1);

            this.currentPercentage = Math.round(
                this.currentPercentage +
                    (this.targetPercentage - this.currentPercentage) * progress,
            );

            this.updateStatusBar();

            if (progress < 1) {
                this.animationFrameId = requestAnimationFrame(animate);
            } else {
                this.animationFrameId = null;
            }
        };

        this.animationFrameId = requestAnimationFrame(animate);
    }

    /**
     * 隐藏状态栏
     */
    hide(): void {
        if (this.statusBarItem) {
            this.statusBarItem.hide();
        }
        this.resetProgress();
    }

    /**
     * 获取当前进度
     */
    getProgress(): { completed: number; total: number } {
        return {
            completed: this.completedProgressSteps,
            total: this.totalProgressSteps
        };
    }

    /**
     * 销毁状态栏管理器
     */
    destroy(): void {
        if (this.statusBarItem) {
            this.statusBarItem.remove();
            this.statusBarItem = undefined;
        }
        this.resetProgress();
    }

    private resetProgress() {
        this.totalProgressSteps = 0;
        this.completedProgressSteps = 0;
        this.currentPercentage = 0;
        this.targetPercentage = 0;
        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }
} 