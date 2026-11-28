// 检索与意图共用的轻量文本工具：不引入分词依赖，中文按 1-gram + 2-gram 切。
const LATIN_OR_CJK = /[a-z0-9]+|[\u3400-\u9fff]+/g;

export function normalize(input: string): string {
  return input.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

export function tokenize(input: string): string[] {
  const tokens: string[] = [];
  for (const part of normalize(input).match(LATIN_OR_CJK) ?? []) {
    if (/^[a-z0-9]+$/.test(part)) {
      tokens.push(part);
      continue;
    }
    const chars = [...part];
    for (let i = 0; i < chars.length; i += 1) {
      const char = chars[i];
      if (char === undefined) continue;
      tokens.push(char);
      const next = chars[i + 1];
      if (next !== undefined) tokens.push(char + next);
    }
  }
  return tokens;
}

export function truncate(input: string, max: number): string {
  const chars = [...input];
  return chars.length <= max ? input : `${chars.slice(0, max).join("")}…`;
}

export function countChars(input: string): number {
  return [...input].length;
}
