import JSZip from "jszip";
import {
  attachmentKindFromName,
  mimeFromAttachmentName,
  type ChatAttachment,
} from "./whatsappParse";

export type LoadedWhatsAppZip = {
  chatText: string;
  attachments: Record<string, ChatAttachment>;
  chatFileName: string;
  attachmentCount: number;
};

function basename(path: string): string {
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] || path;
}

function isChatTextFile(path: string): boolean {
  const name = basename(path).toLowerCase();
  return (
    name === "_chat.txt" ||
    name === "chat.txt" ||
    (name.endsWith(".txt") && name.includes("chat"))
  );
}

function revokeAttachmentUrls(attachments: Record<string, ChatAttachment>) {
  for (const attachment of Object.values(attachments)) {
    URL.revokeObjectURL(attachment.url);
  }
}

export function revokeWhatsAppAttachments(
  attachments: Record<string, ChatAttachment> | null | undefined
) {
  if (!attachments) {
    return;
  }
  revokeAttachmentUrls(attachments);
}

export async function loadWhatsAppZip(file: File): Promise<LoadedWhatsAppZip> {
  const zip = await JSZip.loadAsync(file);
  const entries = Object.values(zip.files).filter((entry) => !entry.dir);

  const chatCandidates = entries.filter((entry) => isChatTextFile(entry.name));
  const chatEntry =
    chatCandidates.find((entry) => basename(entry.name).toLowerCase() === "_chat.txt") ||
    chatCandidates.find((entry) => basename(entry.name).toLowerCase() === "chat.txt") ||
    chatCandidates[0];

  if (!chatEntry) {
    throw new Error("No chat .txt found in this zip (expected _chat.txt).");
  }

  const chatText = await chatEntry.async("string");
  const attachments: Record<string, ChatAttachment> = {};

  for (const entry of entries) {
    if (entry === chatEntry) {
      continue;
    }
    const name = basename(entry.name);
    if (!name || name.toLowerCase().endsWith(".txt")) {
      continue;
    }
    const kind = attachmentKindFromName(name);
    if (kind === "sticker") {
      continue;
    }
    const mime = mimeFromAttachmentName(name);
    const blob = await entry.async("blob");
    const typedBlob =
      blob.type && blob.type !== "application/octet-stream"
        ? blob
        : new Blob([blob], { type: mime });
    attachments[name] = {
      name,
      url: URL.createObjectURL(typedBlob),
      kind,
      mime,
    };
  }

  return {
    chatText,
    attachments,
    chatFileName: basename(chatEntry.name),
    attachmentCount: Object.keys(attachments).length,
  };
}
