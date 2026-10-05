import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { pagesetter, reactvar } from "../App";
import { PageHeader } from "../components/PageHeader";
import { Viewport } from "../hooks/useWindowSize";
import {
  attachmentKindFromName,
  dayKeyFromMs,
  formatDayLabel,
  formatMessageClock,
  keywordHeatColor,
  parseWhatsAppDump,
  parseWhatsAppTimestamp,
  scanWhatsAppMessages,
  type ChatAttachment,
  type ScannedMessage,
} from "../lib/whatsappParse";
import {
  loadWhatsAppZip,
  revokeWhatsAppAttachments,
} from "../lib/whatsappZip";
import {
  buildMeaningfulZoomLevels,
  buildStreamBlocks,
  clusterStyle,
  collectBlockMedia,
  DEFAULT_HIT_FILTERS,
  findSplitLevel,
  isFlaggedMessage,
  minimapChipWeight,
  stepIndexForRawLevel,
  type GrayInnerItem,
  type HitFilters,
  type StreamBlock,
} from "../lib/whatsappZoom";
import "./subpages.css";

type Point = { x: number; y: number };
type InputMode = "zip" | "paste";

const SAMPLE_HINT = `[7/21/26, 7:37:33 PM] ~Name: message text here
[7/21/26, 7:41:17 PM] Other Person: another message`;

function messageBoxStyle(
  message: ScannedMessage,
  filters: HitFilters = DEFAULT_HIT_FILTERS
): React.CSSProperties {
  if (message.isSystem || !isFlaggedMessage(message, filters)) {
    if (message.isSystem) {
      return {
        background: "#171717",
        borderColor: "#333",
        color: "#888",
      };
    }
    return {
      background: "#1d1d1d",
      borderColor: "#444",
      color: "#f2f2f2",
    };
  }

  const hasKeyword = filters.keyword && message.keywordScore > 0;
  const hasLocation = filters.location && message.locationHits.length > 0;
  const hasMedia =
    filters.media &&
    (message.mediaHits.length > 0 || message.attachmentNames.length > 0);

  if (hasKeyword) {
    return {
      background: keywordHeatColor(message.keywordScore),
      borderColor: hasLocation ? "#4da3ff" : hasMedia ? "#c084fc" : "rgba(0,0,0,0.25)",
      borderWidth: hasLocation || hasMedia ? 2 : 1,
      color: "#1a1208",
    };
  }
  if (hasLocation) {
    return {
      background: "hsla(210, 90%, 62%, 0.72)",
      borderColor: hasMedia ? "#c084fc" : "rgba(0,0,0,0.2)",
      borderWidth: hasMedia ? 2 : 1,
      color: "#081018",
    };
  }
  if (hasMedia) {
    return {
      background: "hsla(280, 70%, 62%, 0.7)",
      borderColor: "rgba(0,0,0,0.2)",
      color: "#120818",
    };
  }
  return {
    background: "#1d1d1d",
    borderColor: "#444",
    color: "#f2f2f2",
  };
}

function minimapChipStyle(
  message: ScannedMessage,
  filters: HitFilters
): React.CSSProperties {
  if (message.isSystem || !isFlaggedMessage(message, filters)) {
    return { background: message.isSystem ? "#2a2a2a" : "#3a3a3a" };
  }
  if (filters.keyword && message.keywordScore > 0) {
    return {
      background: keywordHeatColor(Math.max(1, message.keywordScore)),
    };
  }
  if (filters.location && message.locationHits.length > 0) {
    return { background: "hsla(210, 90%, 62%, 0.85)" };
  }
  if (
    filters.media &&
    (message.mediaHits.length > 0 || message.attachmentNames.length > 0)
  ) {
    return { background: "hsla(280, 70%, 62%, 0.85)" };
  }
  return { background: "#3a3a3a" };
}

function displayBody(body: string): string {
  return body
    .replace(/<attached:\s*([^>\n]+)>/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function messageHasImageOrVideo(
  message: ScannedMessage,
  attachmentMap: Record<string, ChatAttachment>
): boolean {
  if (
    message.mediaHits.some((hit) => hit === "image" || hit === "video" || hit === "gif")
  ) {
    return true;
  }
  for (const name of message.attachmentNames) {
    const kind = attachmentMap[name]?.kind ?? attachmentKindFromName(name);
    if (kind === "image" || kind === "video") {
      return true;
    }
  }
  return false;
}

/** Prefer first image/video message; else first flagged message in the block. */
function pickZoomFocusMessage(
  block: Extract<StreamBlock, { type: "flagged" }>,
  hitFilters: HitFilters,
  attachmentMap: Record<string, ChatAttachment>
): ScannedMessage {
  const withMedia = block.messages.find((message) =>
    messageHasImageOrVideo(message, attachmentMap)
  );
  if (withMedia) {
    return withMedia;
  }
  return (
    block.messages.find((message) => isFlaggedMessage(message, hitFilters)) ??
    block.messages[0]
  );
}

/** First message of the latest calendar day in a list (chronological). */
function findLatestDayKey(messages: ScannedMessage[]): string | null {
  let latestDayStartMs = Number.NEGATIVE_INFINITY;
  let latestDayKey: string | null = null;
  for (const message of messages) {
    const ms = parseWhatsAppTimestamp(message.timestamp);
    if (ms == null) {
      continue;
    }
    const key = dayKeyFromMs(ms);
    const dayStart = new Date(ms);
    dayStart.setHours(0, 0, 0, 0);
    const dayStartMs = dayStart.getTime();
    if (dayStartMs >= latestDayStartMs) {
      latestDayStartMs = dayStartMs;
      latestDayKey = key;
    }
  }
  return latestDayKey;
}

/**
 * Scroll target for "start of latest day": prefer the first message in `view`
 * that falls on the dump's latest calendar day; otherwise the first view
 * message on or after that day.
 */
function findLatestDayStartId(
  allMessages: ScannedMessage[],
  viewMessages: ScannedMessage[]
): string | null {
  if (!viewMessages.length) {
    return null;
  }
  const latestDayKey = findLatestDayKey(allMessages) ?? findLatestDayKey(viewMessages);
  if (!latestDayKey) {
    return viewMessages[0]?.id ?? null;
  }

  for (const message of viewMessages) {
    const ms = parseWhatsAppTimestamp(message.timestamp);
    if (ms != null && dayKeyFromMs(ms) === latestDayKey) {
      return message.id;
    }
  }

  let dayStartMs = Number.POSITIVE_INFINITY;
  for (const message of allMessages) {
    const ms = parseWhatsAppTimestamp(message.timestamp);
    if (ms != null && dayKeyFromMs(ms) === latestDayKey) {
      const start = new Date(ms);
      start.setHours(0, 0, 0, 0);
      dayStartMs = start.getTime();
      break;
    }
  }

  for (const message of viewMessages) {
    const ms = parseWhatsAppTimestamp(message.timestamp);
    if (ms != null && ms >= dayStartMs) {
      return message.id;
    }
  }

  return viewMessages[viewMessages.length - 1]?.id ?? null;
}

function animateZoomTo(
  from: number,
  to: number,
  onFrame: (value: number) => void,
  onDone: () => void
): () => void {
  const duration = 420;
  const start = performance.now();
  let frame = 0;
  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    onFrame(from + (to - from) * eased);
    if (t < 1) {
      frame = requestAnimationFrame(tick);
    } else {
      onDone();
    }
  };
  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
}

const AttachmentPreview = ({
  attachments,
}: {
  attachments: ChatAttachment[];
}) => {
  if (!attachments.length) {
    return null;
  }

  return (
    <div className="wa-scan__attachments">
      {attachments.map((attachment) => {
        if (attachment.kind === "sticker") {
          return null;
        }
        if (attachment.kind === "image") {
          return (
            <a
              key={attachment.name}
              className={`wa-scan__attachment wa-scan__attachment--${attachment.kind}`}
              href={attachment.url}
              target="_blank"
              rel="noreferrer"
            >
              <img src={attachment.url} alt={attachment.name} loading="lazy" />
            </a>
          );
        }
        if (attachment.kind === "video") {
          return (
            <video
              key={attachment.name}
              className="wa-scan__attachment wa-scan__attachment--video"
              src={attachment.url}
              controls
              preload="metadata"
            />
          );
        }
        if (attachment.kind === "audio") {
          return (
            <div
              key={attachment.name}
              className="wa-scan__attachment wa-scan__attachment--audio"
            >
              <span>{attachment.name}</span>
              <audio src={attachment.url} controls preload="metadata" />
            </div>
          );
        }
        return (
          <a
            key={attachment.name}
            className="wa-scan__attachment wa-scan__attachment--other"
            href={attachment.url}
            download={attachment.name}
          >
            Download {attachment.name}
          </a>
        );
      })}
    </div>
  );
};

const MediaCarousel = ({ media }: { media: ChatAttachment[] }) => {
  if (!media.length) {
    return null;
  }
  return (
    <div className="wa-scan__carousel">
      {media.map((attachment) =>
        attachment.kind === "video" ? (
          <video
            key={attachment.name}
            className="wa-scan__carousel-item"
            src={attachment.url}
            muted
            playsInline
            preload="metadata"
          />
        ) : (
          <img
            key={attachment.name}
            className="wa-scan__carousel-item"
            src={attachment.url}
            alt={attachment.name}
            loading="lazy"
          />
        )
      )}
    </div>
  );
};

const MessageCard = ({
  message,
  highlighted,
  cardRef,
  attachmentMap,
  hitFilters = DEFAULT_HIT_FILTERS,
  onShowInContext,
}: {
  message: ScannedMessage;
  highlighted?: boolean;
  cardRef?: (node: HTMLElement | null) => void;
  attachmentMap?: Record<string, ChatAttachment>;
  hitFilters?: HitFilters;
  onShowInContext?: () => void;
}) => {
  const chips: Array<{ label: string; className: string }> = [];
  if (message.isSystem) {
    chips.push({
      label: "status",
      className: "wa-scan__chip wa-scan__chip--system",
    });
  }
  if (hitFilters.keyword && message.keywordScore > 0) {
    chips.push({
      label: `alert ×${message.keywordScore}`,
      className: "wa-scan__chip wa-scan__chip--keyword",
    });
  }
  if (hitFilters.location && message.locationHits.length > 0) {
    chips.push({
      label: "location",
      className: "wa-scan__chip wa-scan__chip--location",
    });
  }
  if (hitFilters.media && message.mediaHits.length > 0) {
    chips.push({
      label: "media",
      className: "wa-scan__chip wa-scan__chip--media",
    });
  }

  const resolvedAttachments = (message.attachmentNames || [])
    .map((name) => attachmentMap?.[name])
    .filter((item): item is ChatAttachment => Boolean(item));

  const bodyText = displayBody(message.body);

  return (
    <article
      ref={cardRef}
      id={`wa-msg-${message.id}`}
      className={`wa-scan__message${highlighted ? " is-highlighted" : ""}${
        message.isSystem ? " is-system" : ""
      }`}
      style={messageBoxStyle(message, hitFilters)}
    >
      <header className="wa-scan__message-meta">
        <p className="wa-scan__message-headline">
          <time dateTime={message.timestamp}>
            {formatMessageClock(message.timestamp)}
          </time>
          <span>, </span>
          <strong>[{message.sender}]:</strong>
        </p>
        {chips.length ? (
          <div className="wa-scan__chips">
            {chips.map((chip) => (
              <span key={chip.label} className={chip.className}>
                {chip.label}
              </span>
            ))}
          </div>
        ) : null}
      </header>
      {bodyText ? <p className="wa-scan__message-body">{bodyText}</p> : null}
      <AttachmentPreview attachments={resolvedAttachments} />
      {message.attachmentNames.length > 0 && resolvedAttachments.length === 0 ? (
        <p className="wa-scan__attachment-missing">
          Attachment listed ({message.attachmentNames.join(", ")}) — upload the
          chat zip to preview.
        </p>
      ) : null}
      {(
        (hitFilters.keyword && message.keywordHits.length > 0) ||
        (hitFilters.location && message.locationHits.length > 0) ||
        (hitFilters.media && message.mediaHits.length > 0)
      ) && (
        <footer className="wa-scan__message-hits">
          {hitFilters.keyword && message.keywordHits.length > 0 ? (
            <div>
              <span className="wa-scan__hit-label">Keywords:</span>{" "}
              {message.keywordHits.join(", ")}
            </div>
          ) : null}
          {hitFilters.location && message.locationHits.length > 0 ? (
            <div>
              <span className="wa-scan__hit-label">Location:</span>{" "}
              {message.locationHits.join(", ")}
            </div>
          ) : null}
          {hitFilters.media && message.mediaHits.length > 0 ? (
            <div>
              <span className="wa-scan__hit-label">Media:</span>{" "}
              {message.mediaHits.join(", ")}
            </div>
          ) : null}
        </footer>
      )}
      {onShowInContext ? (
        <button
          type="button"
          className="wa-scan__context"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onShowInContext();
          }}
        >
          Show in context
        </button>
      ) : null}
    </article>
  );
};

const StatusRunCollapse = ({
  item,
  open,
  onToggle,
  attachmentMap,
  focusId,
  messageRefs,
  hitFilters,
}: {
  item: Extract<GrayInnerItem, { type: "status-run" }>;
  open: boolean;
  onToggle: () => void;
  attachmentMap: Record<string, ChatAttachment>;
  focusId: string | null;
  messageRefs: React.MutableRefObject<Record<string, HTMLElement | null>>;
  hitFilters: HitFilters;
}) => {
  const first = item.messages[0];
  const last = item.messages[item.messages.length - 1];
  return (
    <div className={`wa-scan__collapse wa-scan__collapse--system${open ? " is-open" : ""}`}>
      <button type="button" className="wa-scan__collapse-toggle" onClick={onToggle}>
        <span className="wa-scan__collapse-chevron" aria-hidden>
          {open ? "▾" : "▸"}
        </span>
        <span>
          {item.messages.length} status updates between{" "}
          {formatMessageClock(first.timestamp)} and{" "}
          {formatMessageClock(last.timestamp)}
        </span>
      </button>
      {open ? (
        <div className="wa-scan__collapse-body">
          {item.messages.map((message) => (
            <MessageCard
              key={message.id}
              message={message}
              highlighted={focusId === message.id}
              attachmentMap={attachmentMap}
              hitFilters={hitFilters}
              cardRef={(node) => {
                messageRefs.current[message.id] = node;
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
};

const GrayBlock = ({
  block,
  open,
  onToggle,
  openStatuses,
  onToggleStatus,
  attachmentMap,
  focusId,
  messageRefs,
  blockRef,
  hitFilters,
}: {
  block: Extract<StreamBlock, { type: "gray" }>;
  open: boolean;
  onToggle: () => void;
  openStatuses: Record<string, boolean>;
  onToggleStatus: (id: string) => void;
  attachmentMap: Record<string, ChatAttachment>;
  focusId: string | null;
  messageRefs: React.MutableRefObject<Record<string, HTMLElement | null>>;
  blockRef?: (node: HTMLElement | null) => void;
  hitFilters: HitFilters;
}) => {
  const first = block.messages[0];
  const last = block.messages[block.messages.length - 1];
  return (
    <div
      ref={blockRef}
      className={`wa-scan__collapse wa-scan__collapse--quiet${open ? " is-open" : ""}`}
      data-start-index={block.startIndex}
      data-end-index={block.endIndex}
    >
      <button type="button" className="wa-scan__collapse-toggle" onClick={onToggle}>
        <span className="wa-scan__collapse-chevron" aria-hidden>
          {open ? "▾" : "▸"}
        </span>
        <span>
          {block.messages.length} messages between{" "}
          {formatMessageClock(first.timestamp)} and{" "}
          {formatMessageClock(last.timestamp)}
        </span>
      </button>
      {open ? (
        <div className="wa-scan__collapse-body">
          {block.inner.map((item) =>
            item.type === "message" ? (
              <MessageCard
                key={item.message.id}
                message={item.message}
                highlighted={focusId === item.message.id}
                attachmentMap={attachmentMap}
                hitFilters={hitFilters}
                cardRef={(node) => {
                  messageRefs.current[item.message.id] = node;
                }}
              />
            ) : (
              <StatusRunCollapse
                key={item.id}
                item={item}
                open={Boolean(openStatuses[item.id])}
                onToggle={() => onToggleStatus(item.id)}
                attachmentMap={attachmentMap}
                focusId={focusId}
                messageRefs={messageRefs}
                hitFilters={hitFilters}
              />
            )
          )}
        </div>
      ) : null}
    </div>
  );
};

const FlaggedCluster = ({
  block,
  attachmentMap,
  focusId,
  messageRefs,
  onZoomIn,
  blockRef,
  hitFilters,
  onShowInContext,
}: {
  block: Extract<StreamBlock, { type: "flagged" }>;
  attachmentMap: Record<string, ChatAttachment>;
  focusId: string | null;
  messageRefs: React.MutableRefObject<Record<string, HTMLElement | null>>;
  onZoomIn: () => void;
  blockRef?: (node: HTMLElement | null) => void;
  hitFilters: HitFilters;
  onShowInContext?: (messageId: string) => void;
}) => {
  const media = collectBlockMedia(block.messages, attachmentMap);
  const flaggedCount = block.messages.filter((message) =>
    isFlaggedMessage(message, hitFilters)
  ).length;
  const first = block.messages[0];
  const last = block.messages[block.messages.length - 1];

  if (block.messages.length === 1 && isFlaggedMessage(block.messages[0], hitFilters)) {
    return (
      <div
        ref={blockRef}
        data-start-index={block.startIndex}
        data-end-index={block.endIndex}
      >
        <MessageCard
          message={block.messages[0]}
          highlighted={focusId === block.messages[0].id}
          attachmentMap={attachmentMap}
          hitFilters={hitFilters}
          onShowInContext={
            onShowInContext
              ? () => onShowInContext(block.messages[0].id)
              : undefined
          }
          cardRef={(node) => {
            messageRefs.current[block.messages[0].id] = node;
          }}
        />
      </div>
    );
  }

  return (
    <button
      ref={blockRef as React.Ref<HTMLButtonElement>}
      type="button"
      className="wa-scan__cluster"
      style={clusterStyle(block.messages, hitFilters)}
      data-start-index={block.startIndex}
      data-end-index={block.endIndex}
      onClick={onZoomIn}
    >
      <div className="wa-scan__cluster-meta">
        <strong>
          {flaggedCount} flagged
          {block.messages.length > flaggedCount
            ? ` · ${block.messages.length} total`
            : ""}
        </strong>
        <span>
          {formatMessageClock(first.timestamp)} → {formatMessageClock(last.timestamp)}
        </span>
        <em>click to zoom in</em>
      </div>
      <MediaCarousel media={media} />
    </button>
  );
};

const WhatsAppScannerPage = ({ setPage }: { setPage: pagesetter }) => {
  const [rawDump, setRawDump] = useState("");
  const [inputMode, setInputMode] = useState<InputMode>("zip");
  const [filter, setFilter] = useState<"all" | "flagged">("flagged");
  const [hitFilters, setHitFilters] = useState<HitFilters>(DEFAULT_HIT_FILTERS);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [zoomStep, setZoomStep] = useState(0);
  const [grayWeightScale, setGrayWeightScale] = useState(0);
  const [streamGrayOpen, setStreamGrayOpen] = useState(false);
  const [zoomBarOpen, setZoomBarOpen] = useState(false);
  const [filterBusy, setFilterBusy] = useState(false);
  const [openGrays, setOpenGrays] = useState<Record<string, boolean>>({});
  const [openStatuses, setOpenStatuses] = useState<Record<string, boolean>>({});
  const pendingScrollId = useRef<string | null>(null);
  const filterAnimTimer = useRef<number | null>(null);
  const pinMessageId = useRef<string | null>(null);
  const pinScreenY = useRef<number | null>(null);
  const pinLoopRaf = useRef<number | null>(null);
  const needsLatestDayScroll = useRef(false);
  const [attachments, setAttachments] = useState<Record<string, ChatAttachment>>(
    {}
  );
  const [zipName, setZipName] = useState<string | null>(null);
  const [zipStatus, setZipStatus] = useState<string | null>(null);
  const [zipBusy, setZipBusy] = useState(false);
  const [viewport, setViewport] = useState({ top: 0, height: 1 });
  const messageRefs = useRef<Record<string, HTMLElement | null>>({});
  const blockRefs = useRef<Record<string, HTMLElement | null>>({});
  const listRef = useRef<HTMLDivElement | null>(null);
  const minimapTrackRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const attachmentsRef = useRef(attachments);
  const zoomAnimCancel = useRef<(() => void) | null>(null);
  const streamBlocksRef = useRef<StreamBlock[]>([]);
  const visibleRef = useRef<ScannedMessage[]>([]);
  attachmentsRef.current = attachments;

  const scanned = useMemo(() => {
    if (!rawDump.trim()) {
      return [];
    }
    return scanWhatsAppMessages(parseWhatsAppDump(rawDump));
  }, [rawDump]);

  const flagged = useMemo(
    () => scanned.filter((message) => isFlaggedMessage(message, hitFilters)),
    [hitFilters, scanned]
  );

  const visible = filter === "flagged" ? flagged : scanned;
  const allMeaningfulLevels = useMemo(
    () => buildMeaningfulZoomLevels(scanned, hitFilters),
    [hitFilters, scanned]
  );
  const allZoomStepMax = Math.max(0, allMeaningfulLevels.length - 1);
  const meaningfulLevels = useMemo(
    () =>
      filter === "flagged"
        ? buildMeaningfulZoomLevels(flagged, hitFilters)
        : allMeaningfulLevels,
    [allMeaningfulLevels, filter, flagged, hitFilters]
  );
  const zoomStepMax = Math.max(0, meaningfulLevels.length - 1);
  // Flagged-only is always fully expanded (step 0).
  const effectiveStep =
    filter === "flagged"
      ? 0
      : Math.min(zoomStepMax, Math.max(0, Math.floor(zoomStep)));
  const discreteZoom = meaningfulLevels[effectiveStep] ?? 0;

  const streamBlocks = useMemo(
    () => buildStreamBlocks(visible, discreteZoom, hitFilters),
    [discreteZoom, hitFilters, visible]
  );
  visibleRef.current = visible;
  streamBlocksRef.current = streamBlocks;

  const minimapLayout = useMemo(() => {
    const weights = visible.map((message) => {
      const base = minimapChipWeight(message);
      if (filter === "flagged" || isFlaggedMessage(message, hitFilters)) {
        return base;
      }
      return Math.max(0.0001, base * grayWeightScale);
    });
    const total = weights.reduce((sum, weight) => sum + weight, 0) || 1;
    let cursor = 0;
    const chips = visible.map((message, index) => {
      const weight = weights[index];
      const top = (cursor / total) * 100;
      const height = (weight / total) * 100;
      cursor += weight;
      const ms = parseWhatsAppTimestamp(message.timestamp);
      return { message, index, top, height, ms };
    });

    const rawDayMarkers: Array<{ top: number; label: string; key: string; ms: number }> =
      [];
    let previousDay: string | null = null;
    for (const chip of chips) {
      if (chip.ms == null) {
        continue;
      }
      const key = dayKeyFromMs(chip.ms);
      if (key !== previousDay) {
        rawDayMarkers.push({
          top: chip.top,
          label: formatDayLabel(chip.ms),
          key: `${key}-${chip.index}`,
          ms: chip.ms,
        });
        previousDay = key;
      }
    }

    return { chips, rawDayMarkers };
  }, [filter, grayWeightScale, hitFilters, visible]);

  const [minimapHeightPx, setMinimapHeightPx] = useState(0);

  useEffect(() => {
    const track = minimapTrackRef.current;
    if (!track || typeof ResizeObserver === "undefined") {
      setMinimapHeightPx(track?.clientHeight ?? 0);
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const height = entries[0]?.contentRect.height ?? track.clientHeight;
      setMinimapHeightPx(height);
    });
    observer.observe(track);
    setMinimapHeightPx(track.clientHeight);
    return () => observer.disconnect();
  }, [visible.length, filter]);

  const minimapDayBands = useMemo(() => {
    const markers = minimapLayout.rawDayMarkers;
    if (!markers.length) {
      return [];
    }
    // ~10px proximity in the overview track.
    const thresholdPct =
      minimapHeightPx > 0 ? (10 / minimapHeightPx) * 100 : 1.5;

    type Band = {
      key: string;
      top: number;
      height: number;
      startLabel: string;
      endLabel: string;
      clustered: boolean;
    };
    const bands: Band[] = [];
    let groupStart = 0;

    const flush = (from: number, to: number) => {
      const first = markers[from];
      const last = markers[to];
      const top = first.top;
      const bottom = to === from ? first.top : last.top;
      const height = Math.max(0.35, bottom - top);
      const clustered = to > from;
      bands.push({
        key: `${first.key}:${last.key}`,
        top,
        height,
        startLabel: first.label,
        endLabel: last.label,
        clustered,
      });
    };

    for (let index = 1; index < markers.length; index += 1) {
      if (markers[index].top - markers[index - 1].top < thresholdPct) {
        continue;
      }
      flush(groupStart, index - 1);
      groupStart = index;
    }
    flush(groupStart, markers.length - 1);
    return bands;
  }, [minimapHeightPx, minimapLayout.rawDayMarkers]);

  const stats = useMemo(() => {
    let keyword = 0;
    let location = 0;
    let media = 0;
    let flaggedCount = 0;
    for (const message of scanned) {
      if (message.keywordScore > 0) keyword += 1;
      if (message.locationHits.length > 0) location += 1;
      if (message.mediaHits.length > 0) media += 1;
      if (isFlaggedMessage(message, hitFilters)) flaggedCount += 1;
    }
    return {
      total: scanned.length,
      flagged: flaggedCount,
      keyword,
      location,
      media,
      attachments: Object.keys(attachments).length,
    };
  }, [attachments, hitFilters, scanned]);

  useEffect(() => {
    return () => {
      revokeWhatsAppAttachments(attachmentsRef.current);
      zoomAnimCancel.current?.();
      if (filterAnimTimer.current != null) {
        window.clearTimeout(filterAnimTimer.current);
      }
      if (pinLoopRaf.current != null) {
        cancelAnimationFrame(pinLoopRaf.current);
      }
    };
  }, []);

  useEffect(() => {
    setOpenGrays({});
    setOpenStatuses({});
    setZoomStep(0);
    setFocusId(null);
    pendingScrollId.current = null;
    pinMessageId.current = null;
    pinScreenY.current = null;
    setFilter("flagged");
    setGrayWeightScale(0);
    setStreamGrayOpen(false);
    setZoomBarOpen(false);
    setFilterBusy(false);
    needsLatestDayScroll.current = Boolean(rawDump.trim());
  }, [rawDump]);

  useEffect(() => {
    setZoomStep(0);
    setOpenGrays({});
  }, [hitFilters]);

  useEffect(() => {
    if (zoomStep > zoomStepMax) {
      setZoomStep(zoomStepMax);
    }
  }, [zoomStep, zoomStepMax]);

  const getViewportAnchorId = (): string | null => {
    const list = listRef.current;
    if (!list || !visible.length) {
      return null;
    }
    const listRect = list.getBoundingClientRect();
    const midY = listRect.top + listRect.height * 0.4;

    // Prefer an actual message card under the viewport center.
    for (const message of visible) {
      const node = messageRefs.current[message.id];
      if (!node) {
        continue;
      }
      const rect = node.getBoundingClientRect();
      if (rect.bottom <= listRect.top || rect.top >= listRect.bottom) {
        continue;
      }
      if (rect.top <= midY && rect.bottom >= midY) {
        return message.id;
      }
    }

    for (const block of streamBlocks) {
      const node = blockRefs.current[block.id];
      if (!node) {
        continue;
      }
      const rect = node.getBoundingClientRect();
      if (rect.bottom <= listRect.top || rect.top >= listRect.bottom) {
        continue;
      }
      if (rect.top <= midY && rect.bottom >= midY) {
        const span = Math.max(1, block.endIndex - block.startIndex + 1);
        const frac = (midY - rect.top) / Math.max(rect.height, 1);
        const offset = Math.min(span - 1, Math.max(0, Math.floor(frac * span)));
        return (
          visible[block.startIndex + offset]?.id ??
          block.messages[0]?.id ??
          null
        );
      }
    }
    for (const block of streamBlocks) {
      const node = blockRefs.current[block.id];
      if (!node) {
        continue;
      }
      const rect = node.getBoundingClientRect();
      if (rect.bottom > listRect.top && rect.top < listRect.bottom) {
        return block.messages[0]?.id ?? null;
      }
    }
    return visible[0]?.id ?? null;
  };

  const nearestFlaggedId = (anchorId: string | null): string | null => {
    if (!flagged.length) {
      return null;
    }
    if (!anchorId) {
      return flagged[0].id;
    }
    const indexById = new Map(scanned.map((message, index) => [message.id, index]));
    const anchorIndex = indexById.get(anchorId);
    if (anchorIndex == null) {
      return flagged[0].id;
    }
    let best: ScannedMessage | null = null;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const message of flagged) {
      const index = indexById.get(message.id);
      if (index == null) {
        continue;
      }
      const dist = Math.abs(index - anchorIndex);
      if (dist < bestDist) {
        bestDist = dist;
        best = message;
      }
    }
    return best?.id ?? flagged[0].id;
  };

  const resolveMessageNode = (messageId: string): HTMLElement | null => {
    const direct =
      messageRefs.current[messageId] ||
      (document.getElementById(`wa-msg-${messageId}`) as HTMLElement | null);
    if (direct) {
      return direct;
    }
    const index = visibleRef.current.findIndex(
      (message) => message.id === messageId
    );
    if (index < 0) {
      return null;
    }
    const host = streamBlocksRef.current.find(
      (block) => block.startIndex <= index && block.endIndex >= index
    );
    return host ? blockRefs.current[host.id] ?? null : null;
  };

  const applyPinnedScroll = () => {
    const messageId = pinMessageId.current;
    const targetY = pinScreenY.current;
    const list = listRef.current;
    if (!messageId || targetY == null || !list) {
      return;
    }
    const node = resolveMessageNode(messageId);
    if (!node) {
      return;
    }
    const delta = node.getBoundingClientRect().top - targetY;
    if (Math.abs(delta) > 0.25) {
      list.scrollTop += delta;
    }
  };

  const clearPin = () => {
    pinMessageId.current = null;
    pinScreenY.current = null;
    if (pinLoopRaf.current != null) {
      cancelAnimationFrame(pinLoopRaf.current);
      pinLoopRaf.current = null;
    }
  };

  const capturePin = (messageId: string | null): boolean => {
    if (!messageId) {
      clearPin();
      return false;
    }
    const node = resolveMessageNode(messageId);
    if (!node) {
      return false;
    }
    pinMessageId.current = messageId;
    pinScreenY.current = node.getBoundingClientRect().top;
    return true;
  };

  const runPinLoop = (durationMs: number, onDone?: () => void) => {
    if (pinLoopRaf.current != null) {
      cancelAnimationFrame(pinLoopRaf.current);
    }
    const start = performance.now();
    const tick = (now: number) => {
      applyPinnedScroll();
      if (now - start < durationMs) {
        pinLoopRaf.current = requestAnimationFrame(tick);
      } else {
        applyPinnedScroll();
        pinLoopRaf.current = null;
        onDone?.();
      }
    };
    pinLoopRaf.current = requestAnimationFrame(tick);
  };

  const scrollMessageIntoView = (
    messageId: string,
    align: "center" | "start" = "center"
  ): boolean => {
    const list = listRef.current;
    if (!list || !messageId) {
      return false;
    }
    const node = resolveMessageNode(messageId);
    if (!node) {
      return false;
    }
    const listRect = list.getBoundingClientRect();
    const nodeRect = node.getBoundingClientRect();
    if (align === "start") {
      list.scrollTop += nodeRect.top - listRect.top - 8;
    } else {
      const nodeCenter = nodeRect.top + nodeRect.height / 2;
      const listCenter = listRect.top + listRect.height / 2;
      list.scrollTop += nodeCenter - listCenter;
    }
    return true;
  };

  const scrollWhenReady = (
    messageId: string | null,
    onDone?: () => void,
    align: "center" | "start" = "center"
  ) => {
    if (!messageId) {
      pendingScrollId.current = null;
      onDone?.();
      return;
    }
    let attempts = 0;
    const tryOnce = () => {
      if (scrollMessageIntoView(messageId, align) || attempts >= 24) {
        pendingScrollId.current = null;
        onDone?.();
        return;
      }
      attempts += 1;
      filterAnimTimer.current = window.setTimeout(tryOnce, 32);
    };
    requestAnimationFrame(() => requestAnimationFrame(tryOnce));
  };

  const queueScrollToMessage = (messageId: string | null) => {
    if (!messageId) {
      pendingScrollId.current = null;
      return;
    }
    pendingScrollId.current = messageId;
    setFocusId(messageId);
  };

  // Keep the pinned message glued to its screen Y across filter/layout frames.
  useLayoutEffect(() => {
    if (!filterBusy || !pinMessageId.current || pinScreenY.current == null) {
      return;
    }
    applyPinnedScroll();
  }, [
    filter,
    filterBusy,
    streamBlocks,
    grayWeightScale,
    streamGrayOpen,
    zoomBarOpen,
    visible,
  ]);

  // After a dump loads, land on the start of the latest day in the stream.
  useEffect(() => {
    if (!needsLatestDayScroll.current || filterBusy || !visible.length) {
      return;
    }
    const dayStartId = findLatestDayStartId(scanned, visible);
    needsLatestDayScroll.current = false;
    if (!dayStartId) {
      return;
    }
    queueScrollToMessage(dayStartId);
    scrollWhenReady(dayStartId, undefined, "start");
  }, [visible, streamBlocks, filter, filterBusy]);

  const requestFilterChange = (next: "all" | "flagged") => {
    if (next === filter || filterBusy) {
      return;
    }
    const anchorId = getViewportAnchorId();
    setFilterBusy(true);
    if (filterAnimTimer.current != null) {
      window.clearTimeout(filterAnimTimer.current);
    }
    if (pinLoopRaf.current != null) {
      cancelAnimationFrame(pinLoopRaf.current);
      pinLoopRaf.current = null;
    }

    if (next === "flagged") {
      const targetId = nearestFlaggedId(anchorId);
      queueScrollToMessage(targetId);

      const beginCollapse = () => {
        if (targetId) {
          // Keep current screen position if already visible; otherwise center once.
          if (!resolveMessageNode(targetId)) {
            scrollMessageIntoView(targetId, "center");
          }
          if (!capturePin(targetId)) {
            scrollMessageIntoView(targetId, "center");
            capturePin(targetId);
          }
        }
        setStreamGrayOpen(false);
        setZoomBarOpen(false);
        runPinLoop(320);
        const start = performance.now();
        const from = grayWeightScale;
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / 280);
          const eased = 1 - Math.pow(1 - t, 3);
          setGrayWeightScale(from * (1 - eased));
          applyPinnedScroll();
          if (t < 1) {
            requestAnimationFrame(tick);
          } else {
            setGrayWeightScale(0);
            setZoomStep(0);
            setFilter("flagged");
            requestAnimationFrame(() => {
              applyPinnedScroll();
              runPinLoop(140, () => {
                clearPin();
                setFilterBusy(false);
                filterAnimTimer.current = null;
              });
            });
          }
        };
        requestAnimationFrame(tick);
      };

      if (targetId && !resolveMessageNode(targetId)) {
        scrollWhenReady(targetId, beginCollapse);
      } else {
        beginCollapse();
      }
      return;
    }

    // Flagged → All: pin current message, expand quiet messages around it.
    const targetId = anchorId;
    queueScrollToMessage(targetId);
    if (targetId) {
      capturePin(targetId);
    }
    setZoomStep(0);
    setFilter("all");
    setGrayWeightScale(0);
    setStreamGrayOpen(false);
    setZoomBarOpen(false);

    requestAnimationFrame(() => {
      applyPinnedScroll();
      requestAnimationFrame(() => {
        applyPinnedScroll();
        setStreamGrayOpen(true);
        if (allZoomStepMax > 0) {
          setZoomBarOpen(true);
        }
        runPinLoop(380);
        const start = performance.now();
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / 340);
          const eased = 1 - Math.pow(1 - t, 3);
          setGrayWeightScale(eased);
          applyPinnedScroll();
          if (t < 1) {
            requestAnimationFrame(tick);
          } else {
            setGrayWeightScale(1);
            applyPinnedScroll();
            runPinLoop(80, () => {
              clearPin();
              setFilterBusy(false);
            });
          }
        };
        requestAnimationFrame(tick);
      });
    });
  };

  const showInContext = (messageId: string) => {
    if (!messageId) {
      return;
    }
    if (filter === "all") {
      setZoomStep(0);
      queueScrollToMessage(messageId);
      scrollWhenReady(messageId);
      return;
    }
    if (filterBusy) {
      return;
    }
    setFilterBusy(true);
    if (filterAnimTimer.current != null) {
      window.clearTimeout(filterAnimTimer.current);
    }
    if (pinLoopRaf.current != null) {
      cancelAnimationFrame(pinLoopRaf.current);
      pinLoopRaf.current = null;
    }

    queueScrollToMessage(messageId);
    const beginExpand = () => {
      if (!capturePin(messageId)) {
        scrollMessageIntoView(messageId, "center");
        capturePin(messageId);
      }
      setZoomStep(0);
      setFilter("all");
      setGrayWeightScale(0);
      setStreamGrayOpen(false);
      setZoomBarOpen(false);

      requestAnimationFrame(() => {
        applyPinnedScroll();
        requestAnimationFrame(() => {
          applyPinnedScroll();
          setStreamGrayOpen(true);
          if (allZoomStepMax > 0) {
            setZoomBarOpen(true);
          }
          runPinLoop(380);
          const start = performance.now();
          const tick = (now: number) => {
            const t = Math.min(1, (now - start) / 340);
            const eased = 1 - Math.pow(1 - t, 3);
            setGrayWeightScale(eased);
            applyPinnedScroll();
            if (t < 1) {
              requestAnimationFrame(tick);
            } else {
              setGrayWeightScale(1);
              applyPinnedScroll();
              runPinLoop(80, () => {
                clearPin();
                setFilterBusy(false);
              });
            }
          };
          requestAnimationFrame(tick);
        });
      });
    };

    if (!resolveMessageNode(messageId)) {
      scrollWhenReady(messageId, beginExpand);
    } else {
      beginExpand();
    }
  };

  const updateMinimapViewport = () => {
    const list = listRef.current;
    const track = minimapTrackRef.current;
    if (!list || !track || !visible.length) {
      setViewport({ top: 0, height: 1 });
      return;
    }

    const listRect = list.getBoundingClientRect();
    const viewTop = listRect.top;
    const viewBottom = listRect.bottom;

    const indexAtY = (
      block: (typeof streamBlocks)[number],
      rect: DOMRect,
      y: number
    ): number => {
      const span = Math.max(1, block.endIndex - block.startIndex + 1);
      if (span === 1 || rect.height <= 1) {
        return block.startIndex;
      }
      // Map a viewport Y into a message index within this block.
      const frac = (y - rect.top) / rect.height;
      const clamped = Math.min(1, Math.max(0, frac));
      const offset = Math.min(span - 1, Math.floor(clamped * span));
      return block.startIndex + offset;
    };

    let firstIndex: number | null = null;
    let lastIndex: number | null = null;

    for (const block of streamBlocks) {
      const node = blockRefs.current[block.id];
      if (!node) {
        continue;
      }
      const rect = node.getBoundingClientRect();
      // Strict overlap with the visible list pane.
      if (rect.bottom <= viewTop || rect.top >= viewBottom) {
        continue;
      }

      if (firstIndex == null) {
        firstIndex = indexAtY(block, rect, viewTop);
      }
      lastIndex = indexAtY(block, rect, viewBottom - 0.5);
    }

    if (firstIndex == null || lastIndex == null) {
      // At extreme scroll positions, refs can miss a frame — use scroll ratio.
      const maxScroll = Math.max(0, list.scrollHeight - list.clientHeight);
      const scrollRatio = maxScroll <= 0 ? 1 : list.scrollTop / maxScroll;
      const visibleFraction = list.clientHeight / Math.max(list.scrollHeight, 1);
      const height = Math.max(0.04, Math.min(1, visibleFraction));
      const top = Math.min(1 - height, Math.max(0, scrollRatio * (1 - height)));
      setViewport({ top, height });
      return;
    }

    if (lastIndex < firstIndex) {
      lastIndex = firstIndex;
    }

    // Pin to the true ends when the list is scrolled to the extreme.
    const maxScroll = Math.max(0, list.scrollHeight - list.clientHeight);
    if (list.scrollTop <= 1) {
      firstIndex = 0;
    }
    if (maxScroll > 0 && list.scrollTop >= maxScroll - 1) {
      lastIndex = visible.length - 1;
    }

    const firstChip = minimapLayout.chips[firstIndex];
    const lastChip = minimapLayout.chips[lastIndex];
    if (firstChip && lastChip) {
      let top = firstChip.top / 100;
      let height = (lastChip.top + lastChip.height - firstChip.top) / 100;
      height = Math.max(0.02, Math.min(height, 1));
      top = Math.min(Math.max(0, top), 1 - height);
      setViewport({ top, height });
      return;
    }

    let top = firstIndex / visible.length;
    let height = Math.max(0.02, (lastIndex - firstIndex + 1) / visible.length);
    height = Math.min(height, 1);
    top = Math.min(Math.max(0, top), 1 - height);
    setViewport({ top, height });
  };

  useEffect(() => {
    // Wait a frame so block refs are laid out before measuring.
    const frame = requestAnimationFrame(() => updateMinimapViewport());
    return () => cancelAnimationFrame(frame);
  }, [streamBlocks, visible.length, discreteZoom, filter, minimapLayout]);

  useEffect(() => {
    if (!focusId) {
      return;
    }
    const messageIndex = visible.findIndex((message) => message.id === focusId);
    if (messageIndex < 0) {
      return;
    }
    const host = streamBlocks.find(
      (block) =>
        block.startIndex <= messageIndex && block.endIndex >= messageIndex
    );
    if (host?.type === "gray" && !openGrays[host.id]) {
      setOpenGrays((current) => ({ ...current, [host.id]: true }));
      return;
    }
    if (host?.type === "gray") {
      for (const item of host.inner) {
        if (
          item.type === "status-run" &&
          item.messages.some((message) => message.id === focusId) &&
          !openStatuses[item.id]
        ) {
          setOpenStatuses((current) => ({ ...current, [item.id]: true }));
          return;
        }
      }
    }

    // Filter / show-in-context handlers perform the authoritative scroll after
    // layout settles. Only fall back here for other focus sources.
    if (filterBusy || pendingScrollId.current === focusId) {
      const clearTimer = window.setTimeout(() => setFocusId(null), 2400);
      return () => window.clearTimeout(clearTimer);
    }

    let attempts = 0;
    let clearTimer: number | null = null;
    let retryTimer: number | null = null;
    const tryScroll = () => {
      if (scrollMessageIntoView(focusId)) {
        clearTimer = window.setTimeout(() => setFocusId(null), 2200);
        return;
      }
      attempts += 1;
      if (attempts < 16) {
        retryTimer = window.setTimeout(tryScroll, 40);
      }
    };
    tryScroll();
    return () => {
      if (retryTimer != null) {
        window.clearTimeout(retryTimer);
      }
      if (clearTimer != null) {
        window.clearTimeout(clearTimer);
      }
    };
  }, [focusId, openGrays, openStatuses, streamBlocks, visible, filterBusy]);

  const clearAttachments = () => {
    revokeWhatsAppAttachments(attachmentsRef.current);
    setAttachments({});
    setZipName(null);
    setZipStatus(null);
  };

  const clearAll = () => {
    clearAttachments();
    setRawDump("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const onZipSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setZipBusy(true);
    setZipStatus(`Reading ${file.name}…`);
    try {
      const loaded = await loadWhatsAppZip(file);
      revokeWhatsAppAttachments(attachmentsRef.current);
      setAttachments(loaded.attachments);
      setZipName(file.name);
      setRawDump(loaded.chatText);
      setZipStatus(
        `Loaded ${loaded.chatFileName} + ${loaded.attachmentCount} attachments`
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not read that zip.";
      setZipStatus(message);
    } finally {
      setZipBusy(false);
    }
  };

  const zoomIntoBlock = (block: StreamBlock) => {
    if (block.type === "gray") {
      setOpenGrays((current) => ({ ...current, [block.id]: !current[block.id] }));
      return;
    }
    if (block.messages.length <= 1 && effectiveStep === 0) {
      return;
    }
    const targetRaw = findSplitLevel(
      visible,
      block.startIndex,
      block.endIndex,
      discreteZoom,
      hitFilters
    );
    const targetStep = stepIndexForRawLevel(meaningfulLevels, targetRaw);
    if (targetStep >= effectiveStep) {
      return;
    }
    const focusMessage = pickZoomFocusMessage(block, hitFilters, attachments);
    zoomAnimCancel.current?.();
    queueScrollToMessage(focusMessage.id);
    zoomAnimCancel.current = animateZoomTo(
      zoomStep,
      targetStep,
      setZoomStep,
      () => {
        setZoomStep(targetStep);
        zoomAnimCancel.current = null;
        scrollWhenReady(focusMessage.id);
      }
    );
  };

  const onMinimapClick = (messageIndex: number) => {
    const host = streamBlocks.find(
      (block) =>
        block.startIndex <= messageIndex && block.endIndex >= messageIndex
    );
    const node = host ? blockRefs.current[host.id] : null;
    node?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <div className="page-shell wa-scan">
      <PageHeader title="CHAT SCANNER" setPage={setPage} hue={12} />
      <div className="wa-scan__layout">
        <aside className="wa-scan__sidebar">
          <section className="wa-scan__panel">
            <div className="wa-scan__panel-head">
              <h2>Chat input</h2>
              <div className="wa-scan__seg" role="group" aria-label="Input mode">
                <button
                  type="button"
                  className={inputMode === "zip" ? "is-active" : ""}
                  onClick={() => setInputMode("zip")}
                >
                  Chat zip
                </button>
                <button
                  type="button"
                  className={inputMode === "paste" ? "is-active" : ""}
                  onClick={() => setInputMode("paste")}
                >
                  Paste text
                </button>
              </div>
            </div>

            {inputMode === "zip" ? (
              <>
                <p className="wa-scan__hint">
                  Export chat (with media). We’ll read `_chat.txt`
                  and preview photos, videos, and voice notes.
                </p>
                <input
                  ref={fileInputRef}
                  className="wa-scan__file"
                  type="file"
                  accept=".zip,application/zip"
                  onChange={onZipSelected}
                  disabled={zipBusy}
                />
                {zipName ? (
                  <p className="wa-scan__zip-meta">
                    <strong>{zipName}</strong>
                    {zipStatus ? ` — ${zipStatus}` : null}
                  </p>
                ) : zipStatus ? (
                  <p className="wa-scan__zip-meta">{zipStatus}</p>
                ) : null}
              </>
            ) : (
              <>
                <p className="wa-scan__hint">
                  Paste a selection from WhatsApp Desktop. Sender and timestamp
                  are kept so you can find the original message.
                </p>
                <textarea
                  className="wa-scan__input"
                  value={rawDump}
                  onChange={(event) => setRawDump(event.target.value)}
                  placeholder={SAMPLE_HINT}
                  spellCheck={false}
                />
              </>
            )}

            <div className="wa-scan__actions">
              <button type="button" onClick={clearAll}>
                Clear
              </button>
            </div>
          </section>

          <section className="wa-scan__panel">
            <h2>Legend</h2>
            <ul className="wa-scan__legend">
              <li>
                <label className="wa-scan__legend-item">
                  <input
                    type="checkbox"
                    checked={hitFilters.keyword}
                    onChange={(event) =>
                      setHitFilters((current) => ({
                        ...current,
                        keyword: event.target.checked,
                      }))
                    }
                  />
                  <span className="wa-scan__swatch wa-scan__swatch--keyword" />
                  <span>Keyword / vehicle cue — yellower with 1 hit, redder with more</span>
                </label>
              </li>
              <li>
                <label className="wa-scan__legend-item">
                  <input
                    type="checkbox"
                    checked={hitFilters.location}
                    onChange={(event) =>
                      setHitFilters((current) => ({
                        ...current,
                        location: event.target.checked,
                      }))
                    }
                  />
                  <span className="wa-scan__swatch wa-scan__swatch--location" />
                  <span>Location (coords / maps links)</span>
                </label>
              </li>
              <li>
                <label className="wa-scan__legend-item">
                  <input
                    type="checkbox"
                    checked={hitFilters.media}
                    onChange={(event) =>
                      setHitFilters((current) => ({
                        ...current,
                        media: event.target.checked,
                      }))
                    }
                  />
                  <span className="wa-scan__swatch wa-scan__swatch--media" />
                  <span>Image / video / voice note / other media</span>
                </label>
              </li>
            </ul>
          </section>

          <section className="wa-scan__panel">
            <h2>Summary</h2>
            <div className="wa-scan__stats">
              <div>
                <strong>{stats.total}</strong>
                <span>messages</span>
              </div>
              <div>
                <strong>{stats.flagged}</strong>
                <span>flagged</span>
              </div>
              <div>
                <strong>{stats.keyword}</strong>
                <span>keyword</span>
              </div>
              <div>
                <strong>{stats.location}</strong>
                <span>location</span>
              </div>
              <div>
                <strong>{stats.media}</strong>
                <span>media</span>
              </div>
              <div>
                <strong>{stats.attachments}</strong>
                <span>files</span>
              </div>
            </div>
          </section>
        </aside>

        <main className="wa-scan__stream">
          <div className="wa-scan__stream-toolbar">
            <h2>Message stream</h2>
            <div className="wa-scan__toolbar-controls">
              <div className="wa-scan__seg" role="group" aria-label="Filter messages">
                <button
                  type="button"
                  className={filter === "all" ? "is-active" : ""}
                  disabled={filterBusy}
                  onClick={() => requestFilterChange("all")}
                >
                  All
                </button>
                <button
                  type="button"
                  className={filter === "flagged" ? "is-active" : ""}
                  disabled={filterBusy}
                  onClick={() => requestFilterChange("flagged")}
                >
                  Flagged only
                </button>
              </div>
            </div>
          </div>

          {allZoomStepMax > 0 && filter === "all" ? (
            <div
              className={`wa-scan__zoom-slot${zoomBarOpen ? " is-open" : ""}`}
              aria-hidden={!zoomBarOpen}
            >
              <div className="wa-scan__zoom-slot-inner">
                <div className="wa-scan__zoom-bar">
                  <label className="wa-scan__zoom-label" htmlFor="wa-zoom">
                    Zoom
                    <strong>{effectiveStep}</strong>
                    <span>/ {zoomStepMax}</span>
                  </label>
                  <input
                    id="wa-zoom"
                    className="wa-scan__zoom-slider"
                    type="range"
                    min={0}
                    max={zoomStepMax}
                    step={1}
                    value={Math.min(effectiveStep, zoomStepMax)}
                    onChange={(event) => {
                      zoomAnimCancel.current?.();
                      setZoomStep(Number(event.target.value));
                    }}
                  />
                  <div className="wa-scan__zoom-ends">
                    <span>detail</span>
                    <span>overview</span>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {!rawDump.trim() ? (
            <p className="wa-scan__empty">
              {inputMode === "zip"
                ? "Upload a chat zip to begin scanning."
                : "Paste a chat selection to begin scanning."}
            </p>
          ) : visible.length === 0 ? (
            <p className="wa-scan__empty">
              {filter === "flagged"
                ? "No flagged messages in this dump."
                : "Couldn’t parse any messages — check the paste format."}
            </p>
          ) : (
            <div className="wa-scan__workspace">
              <div
                ref={listRef}
                className="wa-scan__list"
                onScroll={updateMinimapViewport}
              >
                {(() => {
                  let previousDay: string | null = null;
                  return streamBlocks.map((block) => {
                    const firstMs = parseWhatsAppTimestamp(
                      block.messages[0].timestamp
                    );
                    const dayKey =
                      firstMs == null ? null : dayKeyFromMs(firstMs);
                    const showDateMarker =
                      dayKey != null && dayKey !== previousDay;
                    if (dayKey != null) {
                      previousDay = dayKey;
                    }

                    const dateMarker =
                      showDateMarker && firstMs != null ? (
                        <div
                          key={`date-${dayKey}`}
                          className="wa-scan__date-sticky"
                        >
                          {formatDayLabel(firstMs)}
                        </div>
                      ) : null;

                    if (block.type === "gray") {
                      if (block.messages.length === 1) {
                        const message = block.messages[0];
                        return (
                          <div
                            key={block.id}
                            className={`wa-scan__gray-reveal${
                              streamGrayOpen ? " is-open" : ""
                            }`}
                          >
                            <div className="wa-scan__gray-reveal-inner">
                              {dateMarker}
                              <div
                                data-start-index={block.startIndex}
                                data-end-index={block.endIndex}
                                ref={(node) => {
                                  blockRefs.current[block.id] = node;
                                }}
                              >
                                <MessageCard
                                  message={message}
                                  highlighted={focusId === message.id}
                                  attachmentMap={attachments}
                                  hitFilters={hitFilters}
                                  cardRef={(node) => {
                                    messageRefs.current[message.id] = node;
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      }
                      return (
                        <div
                          key={block.id}
                          className={`wa-scan__gray-reveal${
                            streamGrayOpen ? " is-open" : ""
                          }`}
                        >
                          <div className="wa-scan__gray-reveal-inner">
                            {dateMarker}
                            <GrayBlock
                              block={block}
                              open={Boolean(openGrays[block.id])}
                              onToggle={() =>
                                setOpenGrays((current) => ({
                                  ...current,
                                  [block.id]: !current[block.id],
                                }))
                              }
                              openStatuses={openStatuses}
                              onToggleStatus={(id) =>
                                setOpenStatuses((current) => ({
                                  ...current,
                                  [id]: !current[id],
                                }))
                              }
                              attachmentMap={attachments}
                              focusId={focusId}
                              messageRefs={messageRefs}
                              hitFilters={hitFilters}
                              blockRef={(node) => {
                                blockRefs.current[block.id] = node;
                              }}
                            />
                          </div>
                        </div>
                      );
                    }
                    return (
                      <React.Fragment key={block.id}>
                        {dateMarker}
                        <FlaggedCluster
                          block={block}
                          attachmentMap={attachments}
                          focusId={focusId}
                          messageRefs={messageRefs}
                          hitFilters={hitFilters}
                          onShowInContext={
                            filter === "flagged" ? showInContext : undefined
                          }
                          onZoomIn={() => zoomIntoBlock(block)}
                          blockRef={(node) => {
                            blockRefs.current[block.id] = node;
                          }}
                        />
                      </React.Fragment>
                    );
                  });
                })()}
              </div>

              <aside className="wa-scan__minimap" aria-label="Message overview">
                <div className="wa-scan__minimap-track" ref={minimapTrackRef}>
                  {minimapLayout.chips.map((chip) => (
                    <button
                      key={chip.message.id}
                      type="button"
                      className="wa-scan__minimap-chip"
                        style={{
                        ...minimapChipStyle(chip.message, hitFilters),
                        top: `${chip.top}%`,
                        height: `${chip.height}%`,
                      }}
                      title={`${formatMessageClock(chip.message.timestamp)}, [${chip.message.sender}]`}
                      onClick={() => onMinimapClick(chip.index)}
                    />
                  ))}
                  {minimapDayBands.map((band) => (
                    <div
                      key={band.key}
                      className={`wa-scan__minimap-day${
                        band.clustered ? " is-clustered" : ""
                      }`}
                      style={{ top: `${band.top}%`, height: `${band.height}%` }}
                    >
                      <span className="wa-scan__minimap-day-mark" />
                      <div className="wa-scan__minimap-day-labels">
                        <span>{band.startLabel}</span>
                        {band.clustered ? <span>{band.endLabel}</span> : null}
                      </div>
                    </div>
                  ))}
                  <div
                    className="wa-scan__minimap-viewport"
                    style={{
                      top: `${viewport.top * 100}%`,
                      height: `${viewport.height * 100}%`,
                    }}
                  />
                </div>
              </aside>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default function WhatsAppScanner(
  _timer: number,
  setPage: pagesetter,
  _mouse: Point,
  _extravars: reactvar[],
  _viewport: Viewport
) {
  return <WhatsAppScannerPage setPage={setPage} />;
}
