import React from "react";
import { linesToParagraphs } from "../lib/formatDescription";

type TabDescriptionProps = {
  lines: string[];
  className?: string;
};

export const TabDescription: React.FC<TabDescriptionProps> = ({ lines, className = "" }) => (
  <div className={`tab-description ${className}`.trim()}>
    {linesToParagraphs(lines).map((paragraph, index) => (
      <p
        key={index}
        className={paragraph.style === "header" ? "tab-description__header" : "tab-description__body"}
      >
        {paragraph.text}
      </p>
    ))}
  </div>
);
