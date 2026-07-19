/**
 * チケットシステム連携の拡張ポイント（要求 §5「口だけアーキテクチャ上確保」/ §6 スコープ外）。
 *
 * 実装は用意しない。現状 ticket_url は保持と表示のみで、内容の複製はしない
 * （タイトル + URL + 見積のみの軽量運用という要求 §3.1 の方針）。
 *
 * 将来 Backlog/Jira 等と繋ぐ場合はこのインターフェースを実装し、
 * NoteFactory のタスク生成時に差し込む。
 */

export interface TicketSummary {
	title: string;
	/** 見積（分）。取得できなければ undefined。 */
	estimateMin?: number;
}

export interface TicketProvider {
	/** この URL を扱えるか。 */
	canHandle(url: string): boolean;
	fetchSummary(url: string): Promise<TicketSummary | null>;
}

/** 登録された provider から最初に扱えるものを選ぶ。現状は常に空。 */
export class TicketProviderRegistry {
	private providers: TicketProvider[] = [];

	register(provider: TicketProvider): void {
		this.providers.push(provider);
	}

	resolve(url: string): TicketProvider | null {
		return this.providers.find((p) => p.canHandle(url)) ?? null;
	}
}
