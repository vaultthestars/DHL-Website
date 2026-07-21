export type DescriptionParagraph = {
  text: string;
  style: "header" | "body";
};

const isProgramsHeader = (text: string): boolean => /^Programs used:/i.test(text);

export const linesToParagraphs = (lines: string[]): DescriptionParagraph[] => {
  const paragraphs: DescriptionParagraph[] = [];
  let current: string[] = [];

  const flush = () => {
    if (current.length === 0) {
      return;
    }
    const text = current.join(" ").trim();
    if (!text) {
      current = [];
      return;
    }
    const isFirst = paragraphs.length === 0;
    paragraphs.push({
      text,
      style: isFirst && isProgramsHeader(text) ? "header" : "body",
    });
    current = [];
  };

  for (const line of lines) {
    if (line === "") {
      flush();
    } else {
      current.push(line);
    }
  }
  flush();
  return paragraphs;
};

export const linesToPlainParagraphs = (lines: string[]): string[] =>
  linesToParagraphs(lines).map((paragraph) => paragraph.text);
