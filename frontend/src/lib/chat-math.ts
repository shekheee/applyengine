const TEX_COMMAND =
  /\\(?:begin|frac|int|left|mathbf|mathrm|right|sum|text|mid|prod)\b/;

function cleanDisplayMath(value: string) {
  // Models sometimes bold every line of an equation. Those markers are invalid
  // inside a TeX block, so remove them after we have identified the block.
  return value.replace(/\*\*/g, "").trim();
}

export function normalizeChatMath(content: string) {
  return content
    // Standard LaTeX display delimiters are otherwise interpreted as escaped
    // square brackets by CommonMark.
    .replace(/\*\*\s*\\\[([\s\S]*?)\\\]\s*\*\*/g, (_, value: string) =>
      `\n$$\n${cleanDisplayMath(value)}\n$$\n`,
    )
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, value: string) =>
      `\n$$\n${cleanDisplayMath(value)}\n$$\n`,
    )
    // Recover the common model variant where the slash before [ or ] was
    // omitted, but only when the block clearly contains TeX commands.
    .replace(
      /(^|\n)\s*\*{0,2}\[\s*([\s\S]*?)\]\s*\*{0,2}(?=\n|$)/g,
      (match: string, prefix: string, value: string) =>
        TEX_COMMAND.test(value)
          ? `${prefix}$$\n${cleanDisplayMath(value)}\n$$`
          : match,
    )
    // Support the other standard LaTeX delimiter style for inline equations.
    .replace(/\*\*\s*\\\(([\s\S]*?)\\\)\s*\*\*/g, (_, value: string) =>
      `$${value.trim()}$`,
    )
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, value: string) => `$${value.trim()}$`);
}
