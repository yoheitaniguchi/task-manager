/**
 * プラグイン設定（要求 §F10）。
 */

import { DEFAULT_ROLE_WEIGHTS, type RoleWeights } from '../domain/meetingEval';

export interface PluginSettings {
	/** doing 列の WIP 上限。既定 3。 */
	wipLimit: number;
	/** 1日の可処分時間（分）。既定 6h。 */
	disposableMin: number;
	/** waiting 1件あたりのフォローアップコスト（分）。既定 10。 */
	followUpCostMin: number;
	roleWeights: RoleWeights;
	/** 高重要とみなす役割係数の下限。 */
	highImportanceThreshold: number;
	/** 高コストとみなす人時の下限。 */
	highCostThreshold: number;
	/** ICS 購読 URL（Google/Outlook の公開 ICS リンク）。 */
	icsUrls: string[];
	/** ICS の自動取得間隔（分）。0 で自動取得しない。 */
	icsRefreshIntervalMin: number;
	/** デイリープランニングを提案し始める時刻（HH:mm）。 */
	planningPromptTime: string;
	/** backlog 滞留を警告する日数。既定 14。 */
	staleBacklogDays: number;
	/** 委譲後、無変化を警告する日数。既定 7。 */
	silentDelegationDays: number;
	/** タスクノートの生成先フォルダ。 */
	taskFolder: string;

	// --- 以下は設定画面に出さない内部状態 ---
	/** デイリープランニングを最後に提案/実施した日（YYYY-MM-DD）。 */
	lastPlanningDate: string;
	/** 週次サマリーを最後に表示した日（YYYY-MM-DD）。 */
	lastWeeklySummaryDate: string;
}

export const DEFAULT_SETTINGS: PluginSettings = {
	wipLimit: 3,
	disposableMin: 360,
	followUpCostMin: 10,
	roleWeights: { ...DEFAULT_ROLE_WEIGHTS },
	highImportanceThreshold: 3,
	highCostThreshold: 4,
	icsUrls: [],
	icsRefreshIntervalMin: 60,
	planningPromptTime: '09:00',
	staleBacklogDays: 14,
	silentDelegationDays: 7,
	taskFolder: 'Tasks',
	lastPlanningDate: '',
	lastWeeklySummaryDate: '',
};

/**
 * 保存済み設定を既定値にマージする。
 * roleWeights はネストしているので Object.assign では埋まらない。
 */
export function mergeSettings(saved: unknown): PluginSettings {
	const s = (saved ?? {}) as Partial<PluginSettings>;
	return {
		...DEFAULT_SETTINGS,
		...s,
		roleWeights: { ...DEFAULT_SETTINGS.roleWeights, ...(s.roleWeights ?? {}) },
		icsUrls: Array.isArray(s.icsUrls) ? s.icsUrls : [...DEFAULT_SETTINGS.icsUrls],
	};
}
