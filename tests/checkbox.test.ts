import { describe, expect, it } from 'vitest';
import {
	parseCheckboxLine,
	sanitizeNoteName,
	toPromotedLine,
} from '../src/domain/checkbox';

describe('parseCheckboxLine', () => {
	it('未チェックの行を解析する', () => {
		expect(parseCheckboxLine('- [ ] 資料をレビューする')).toMatchObject({
			checked: false,
			text: '資料をレビューする',
			indent: '',
			bullet: '-',
		});
	});

	it('チェック済みの行を解析する', () => {
		expect(parseCheckboxLine('- [x] 完了したもの')?.checked).toBe(true);
		expect(parseCheckboxLine('- [X] 大文字も')?.checked).toBe(true);
	});

	it('インデントと bullet 種別を保持する', () => {
		expect(parseCheckboxLine('    * [ ] ネストした項目')).toMatchObject({
			indent: '    ',
			bullet: '*',
		});
		expect(parseCheckboxLine('1. [ ] 番号付き')?.bullet).toBe('1.');
	});

	it('チェックボックスでない行は null', () => {
		expect(parseCheckboxLine('ただの段落')).toBeNull();
		expect(parseCheckboxLine('- 箇条書きだがチェックボックスでない')).toBeNull();
		expect(parseCheckboxLine('')).toBeNull();
	});

	it('本文が空の行は昇格対象にしない', () => {
		expect(parseCheckboxLine('- [ ] ')).toBeNull();
	});
});

describe('toPromotedLine', () => {
	it('インデントとチェック状態を保ったままリンクに置き換える', () => {
		const parsed = parseCheckboxLine('  - [ ] 資料レビュー')!;
		expect(toPromotedLine(parsed, '資料レビュー')).toBe('  - [ ] [[資料レビュー]]');
	});

	it('チェック済みなら x を維持する', () => {
		const parsed = parseCheckboxLine('- [x] 済んだ作業')!;
		expect(toPromotedLine(parsed, '済んだ作業')).toBe('- [x] [[済んだ作業]]');
	});
});

describe('sanitizeNoteName', () => {
	it('ファイル名に使えない文字を落とす', () => {
		expect(sanitizeNoteName('A/B:C*D?E"F<G>H|I')).toBe('A B C D E F G H I');
	});

	it('wikilink は表示テキストだけ残す', () => {
		expect(sanitizeNoteName('[[プロジェクトA|A案件]] の確認')).toBe('プロジェクトA の確認');
	});

	it('マークダウンリンクは表示テキストだけ残す', () => {
		expect(sanitizeNoteName('[チケット](https://example.com/1) を確認')).toBe('チケット を確認');
	});

	it('空になったらフォールバック名を返す', () => {
		expect(sanitizeNoteName('///')).toBe('Untitled task');
	});

	it('長すぎる名前は切り詰める', () => {
		expect(sanitizeNoteName('あ'.repeat(200))).toHaveLength(100);
	});
});
