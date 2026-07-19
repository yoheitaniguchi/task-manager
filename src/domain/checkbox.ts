/**
 * デイリーノート内のチェックボックス行の解析（要求 §F7 第一層）。
 *
 * 第一層そのものにはプラグインは関与しない。昇格するときだけこの解析を使う。
 */

const CHECKBOX_RE = /^(\s*)([-*+]|\d+\.)\s+\[([ xX/\-])\]\s+(.*)$/;

export interface ParsedCheckbox {
	indent: string;
	bullet: string;
	checked: boolean;
	/** チェックボックス以降の本文。 */
	text: string;
}

export function parseCheckboxLine(line: string): ParsedCheckbox | null {
	const m = CHECKBOX_RE.exec(line);
	if (!m) return null;
	const [, indent, bullet, mark, text] = m;
	if (text.trim() === '') return null;
	return { indent, bullet, checked: mark.toLowerCase() === 'x', text: text.trim() };
}

/**
 * 昇格後に元行を置き換える文字列。
 * チェック状態とインデントは保つ（デイリーノートの見た目を壊さないため）。
 */
export function toPromotedLine(parsed: ParsedCheckbox, noteName: string): string {
	const mark = parsed.checked ? 'x' : ' ';
	return `${parsed.indent}${parsed.bullet} [${mark}] [[${noteName}]]`;
}

/**
 * Obsidian のファイル名として使えない文字を落とす。
 * チェックボックス本文をそのままノート名にするため必要。
 */
export function sanitizeNoteName(text: string): string {
	const cleaned = text
		// wikilink / マークダウンリンクは表示テキストだけ残す
		.replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, '$1')
		.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
		.replace(/[\\/:*?"<>|#^[\]]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	// 空になったらフォールバック（無題ノートを作らせない）
	return (cleaned || 'Untitled task').slice(0, 100);
}
