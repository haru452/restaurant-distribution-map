// 検索語の表記ゆれをそろえる

const SMALL_TO_LARGE: Record<string, string> = {
  ァ: "ア", ィ: "イ", ゥ: "ウ", ェ: "エ", ォ: "オ",
  ッ: "ツ", ャ: "ヤ", ュ: "ユ", ョ: "ヨ", ヮ: "ワ", ヵ: "カ", ヶ: "ケ",
};

/** ひらがな（ぁ〜ゖ）をカタカナにする */
export function hiraganaToKatakana(s: string): string {
  return s.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
}

/** 前後の空白を除き、全角英数字を半角に、ひらがなをカタカナにし、連続する空白を1つにする */
export function normalizeQuery(input: string): string {
  return hiraganaToKatakana(input.normalize("NFKC")).replace(/\s+/g, " ").trim();
}

/** 文字か数字を1つ以上含むか */
export function isValidQuery(normalized: string): boolean {
  return /[\p{L}\p{N}]/u.test(normalized);
}

/** 候補探しの比較用：「ー」を除き、小さい字を大きい字に、英字を小文字に、空白を除く */
export function looseKey(input: string): string {
  return normalizeQuery(input)
    .replace(/[ー\s]/g, "")
    .replace(/[ァィゥェォッャュョヮヵヶ]/g, (c) => SMALL_TO_LARGE[c])
    .toLowerCase();
}
