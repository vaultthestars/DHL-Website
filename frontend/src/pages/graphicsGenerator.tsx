import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alignment,
  decodeImage,
  Fit,
  Layout,
  useRive,
  useViewModelInstanceBoolean,
  useViewModelInstanceEnum,
  useViewModelInstanceNumber,
  useViewModelInstanceString,
  type ViewModelInstance,
} from "@rive-app/react-canvas";
import type { Rive } from "@rive-app/canvas";
import { pagesetter, reactvar } from "../App";
import { PageHeader } from "../components/PageHeader";
import { Viewport } from "../hooks/useWindowSize";
import {
  fetchStaticMapBytes,
  getGoogleMapsApiKey,
  loadGoogleMaps,
} from "../lib/googleMaps";
import "./subpages.css";

type Point = { x: number; y: number };
type LangMode = "english" | "spanish" | "both";
type MediaMode = "image" | "map";

const RIV_SRC = "/fd_graphic_generator.riv?v=2";
const ARTBOARD = "Artboard 1";
const STATE_MACHINE = "State Machine 1";

const STRING_FIELDS = [
  { path: "location_1_db_str", label: "Location" },
  { path: "location_2_db_str", label: "City/Municipality" },
] as const;

const WEEKDAY_NAMES = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
] as const;

const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const WEEKDAY_PATH = "weekday_db_enum";
const IMAGE_PATH = "graphic_db_img";

const SYNC_NUMBER_PATHS = [
  "x_offset_db_num",
  "y_offset_db_num",
  "scalefac_db_num",
  "num_detained_db_num",
  "month_db_num",
  "hour_db_num",
  "minute_db_num",
  "date_db_num",
  "year_db_num",
] as const;

const SYNC_STRING_PATHS = ["location_1_db_str", "location_2_db_str"] as const;
const SYNC_BOOL_PATHS = ["at_least_db_bool", "am_db_bool"] as const;

const DETAINED_OPTIONS = rangeInts(0, 200);
const SCALE_MIN = 10;
const SCALE_MAX = 400;
const RING_BASE_PX = 54;

function rangeInts(min: number, max: number): number[] {
  const values: number[] = [];
  for (let value = min; value <= max; value += 1) {
    values.push(value);
  }
  return values;
}

function downloadCanvasPng(canvas: HTMLCanvasElement, filename: string): void {
  const url = canvas.toDataURL("image/png");
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
}

function sanitizeFilenamePart(value: string): string {
  const cleaned = value
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || "unknown";
}

function buildExportFilename(
  viewModelInstance: ViewModelInstance | null | undefined,
  language: "ENGLISH" | "SPANISH"
): string {
  const year = viewModelInstance?.number("year_db_num")?.value;
  const month = viewModelInstance?.number("month_db_num")?.value;
  const day = viewModelInstance?.number("date_db_num")?.value;
  const municipality =
    viewModelInstance?.string("location_2_db_str")?.value?.trim() || "unknown";

  const datePart =
    year != null && month != null && day != null
      ? `${Math.round(year)}-${pad2(Math.round(month))}-${pad2(Math.round(day))}`
      : "unknown-date";

  return `${datePart}_${sanitizeFilenamePart(municipality)}_${language}.png`;
}

function waitFrames(count: number): Promise<void> {
  return new Promise((resolve) => {
    let remaining = count;
    const tick = () => {
      remaining -= 1;
      if (remaining <= 0) {
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function buildCalendarCells(year: number, month: number): Array<number | null> {
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const totalDays = daysInMonth(year, month);
  const cells: Array<number | null> = [];
  for (let i = 0; i < firstWeekday; i += 1) {
    cells.push(null);
  }
  for (let day = 1; day <= totalDays; day += 1) {
    cells.push(day);
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }
  return cells;
}

type LayoutMap = {
  scale: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
};

function getContainLayout(
  hostWidth: number,
  hostHeight: number,
  artboardWidth: number,
  artboardHeight: number
): LayoutMap {
  const scale = Math.min(hostWidth / artboardWidth, hostHeight / artboardHeight);
  return {
    scale,
    offsetX: (hostWidth - artboardWidth * scale) / 2,
    offsetY: (hostHeight - artboardHeight * scale) / 2,
    width: hostWidth,
    height: hostHeight,
  };
}

function applyNowDefaults(viewModelInstance: ViewModelInstance): void {
  const now = new Date();
  const hour24 = now.getHours();
  const isAm = hour24 < 12;
  let hour12 = hour24 % 12;
  if (hour12 === 0) {
    hour12 = 12;
  }

  const year = viewModelInstance.number("year_db_num");
  const month = viewModelInstance.number("month_db_num");
  const day = viewModelInstance.number("date_db_num");
  const hour = viewModelInstance.number("hour_db_num");
  const minute = viewModelInstance.number("minute_db_num");
  const am = viewModelInstance.boolean("am_db_bool");
  const atLeast = viewModelInstance.boolean("at_least_db_bool");
  const weekday = viewModelInstance.enum(WEEKDAY_PATH);

  if (year) year.value = now.getFullYear();
  if (month) month.value = now.getMonth() + 1;
  if (day) day.value = now.getDate();
  if (hour) hour.value = hour12;
  if (minute) minute.value = now.getMinutes();
  if (am) am.value = isAm;
  if (atLeast) atLeast.value = false;
  if (weekday) weekday.value = WEEKDAY_NAMES[now.getDay()];
}

function syncViewModelExceptSpanish(
  source: ViewModelInstance,
  target: ViewModelInstance
): void {
  for (const path of SYNC_NUMBER_PATHS) {
    const from = source.number(path);
    const to = target.number(path);
    if (from && to && to.value !== from.value) {
      to.value = from.value;
    }
  }
  for (const path of SYNC_STRING_PATHS) {
    const from = source.string(path);
    const to = target.string(path);
    if (from && to && to.value !== from.value) {
      to.value = from.value;
    }
  }
  for (const path of SYNC_BOOL_PATHS) {
    const from = source.boolean(path);
    const to = target.boolean(path);
    if (from && to && to.value !== from.value) {
      to.value = from.value;
    }
  }
  const fromWeekday = source.enum(WEEKDAY_PATH);
  const toWeekday = target.enum(WEEKDAY_PATH);
  if (fromWeekday && toWeekday && toWeekday.value !== fromWeekday.value) {
    toWeekday.value = fromWeekday.value;
  }
  const spanish = target.boolean("spanish_db_bool");
  if (spanish && spanish.value !== true) {
    spanish.value = true;
  }
}

const BoundStringField = ({
  path,
  label,
  viewModelInstance,
}: {
  path: string;
  label: string;
  viewModelInstance: ViewModelInstance | null;
}) => {
  const { value, setValue } = useViewModelInstanceString(path, viewModelInstance);
  return (
    <label className="graphics-gen__field">
      <span>{label}</span>
      <input
        type="text"
        value={value ?? ""}
        onChange={(event) => setValue(event.target.value)}
      />
    </label>
  );
};

const BoundDetainedField = ({
  viewModelInstance,
}: {
  viewModelInstance: ViewModelInstance | null;
}) => {
  const { value, setValue } = useViewModelInstanceNumber(
    "num_detained_db_num",
    viewModelInstance
  );
  const { value: atLeast, setValue: setAtLeast } = useViewModelInstanceBoolean(
    "at_least_db_bool",
    viewModelInstance
  );

  const selectOptions = useMemo(() => {
    if (value === null || DETAINED_OPTIONS.some((option) => option === value)) {
      return DETAINED_OPTIONS;
    }
    return [...DETAINED_OPTIONS, value].sort((left, right) => left - right);
  }, [value]);

  return (
    <div className="graphics-gen__field">
      <span>Number detained</span>
      <div className="graphics-gen__detained-row">
        <select
          className="graphics-gen__quantity-mode"
          value={atLeast ? "at_least" : "exactly"}
          onChange={(event) => setAtLeast(event.target.value === "at_least")}
          disabled={atLeast === null}
        >
          <option value="exactly">exactly</option>
          <option value="at_least">at least</option>
        </select>
        <select
          value={value === null ? "" : String(value)}
          onChange={(event) => setValue(Number(event.target.value))}
          disabled={value === null}
        >
          {value === null ? <option value="">—</option> : null}
          {selectOptions.map((option) => (
            <option key={option} value={String(option)}>
              {option}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};

const BoundDateField = ({
  viewModelInstance,
}: {
  viewModelInstance: ViewModelInstance | null;
}) => {
  const { value: month, setValue: setMonth } = useViewModelInstanceNumber(
    "month_db_num",
    viewModelInstance
  );
  const { value: day, setValue: setDay } = useViewModelInstanceNumber(
    "date_db_num",
    viewModelInstance
  );
  const { value: year, setValue: setYear } = useViewModelInstanceNumber(
    "year_db_num",
    viewModelInstance
  );
  const { setValue: setWeekday } = useViewModelInstanceEnum(WEEKDAY_PATH, viewModelInstance);

  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const selectedYear = year ?? new Date().getFullYear();
  const selectedMonth = month ?? new Date().getMonth() + 1;
  const selectedDay = day ?? new Date().getDate();

  const [viewYear, setViewYear] = useState(selectedYear);
  const [viewMonth, setViewMonth] = useState(selectedMonth);

  useEffect(() => {
    if (!open) {
      return;
    }
    setViewYear(selectedYear);
    setViewMonth(selectedMonth);
  }, [open, selectedYear, selectedMonth]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const applyDate = (nextYear: number, nextMonth: number, nextDay: number) => {
    const safeDay = clampInt(nextDay, 1, daysInMonth(nextYear, nextMonth));
    setYear(nextYear);
    setMonth(nextMonth);
    setDay(safeDay);
    const weekday = WEEKDAY_NAMES[new Date(nextYear, nextMonth - 1, safeDay).getDay()];
    setWeekday(weekday);
    setOpen(false);
  };

  const shiftMonth = (delta: number) => {
    const date = new Date(viewYear, viewMonth - 1 + delta, 1);
    setViewYear(date.getFullYear());
    setViewMonth(date.getMonth() + 1);
  };

  const label =
    month !== null && day !== null && year !== null
      ? `${MONTH_LABELS[month - 1]} ${day}, ${year}`
      : "Select date";

  const cells = buildCalendarCells(viewYear, viewMonth);

  return (
    <div className="graphics-gen__field" ref={rootRef}>
      <span>Date</span>
      <button
        type="button"
        className="graphics-gen__picker-trigger"
        onClick={() => setOpen((current) => !current)}
        disabled={month === null || day === null || year === null}
      >
        <span>{label}</span>
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <rect x="3" y="5" width="18" height="16" rx="2" fill="none" stroke="currentColor" strokeWidth="1.75" />
          <path d="M3 10h18M8 3v4M16 3v4" fill="none" stroke="currentColor" strokeWidth="1.75" />
        </svg>
      </button>
      {open ? (
        <div className="graphics-gen__calendar" role="dialog" aria-label="Choose date">
          <div className="graphics-gen__calendar-header">
            <button type="button" onClick={() => shiftMonth(-1)} aria-label="Previous month">
              ‹
            </button>
            <div className="graphics-gen__calendar-title">
              {MONTH_LABELS[viewMonth - 1]} {viewYear}
            </div>
            <button type="button" onClick={() => shiftMonth(1)} aria-label="Next month">
              ›
            </button>
          </div>
          <div className="graphics-gen__calendar-weekdays">
            {["S", "M", "T", "W", "T", "F", "S"].map((weekday, index) => (
              <span key={`${weekday}-${index}`}>{weekday}</span>
            ))}
          </div>
          <div className="graphics-gen__calendar-grid">
            {cells.map((cell, index) => {
              if (cell === null) {
                return <span key={`empty-${index}`} className="graphics-gen__calendar-empty" />;
              }
              const isSelected =
                cell === selectedDay &&
                viewMonth === selectedMonth &&
                viewYear === selectedYear;
              return (
                <button
                  key={`${viewYear}-${viewMonth}-${cell}`}
                  type="button"
                  className={`graphics-gen__calendar-day${isSelected ? " is-selected" : ""}`}
                  onClick={() => applyDate(viewYear, viewMonth, cell)}
                >
                  {cell}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className="graphics-gen__calendar-today"
            onClick={() => {
              const now = new Date();
              applyDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
            }}
          >
            Today
          </button>
        </div>
      ) : null}
    </div>
  );
};

type TimeSegment = "hour" | "minute";

const BoundTimeField = ({
  viewModelInstance,
}: {
  viewModelInstance: ViewModelInstance | null;
}) => {
  const { value: hour, setValue: setHour } = useViewModelInstanceNumber(
    "hour_db_num",
    viewModelInstance
  );
  const { value: minute, setValue: setMinute } = useViewModelInstanceNumber(
    "minute_db_num",
    viewModelInstance
  );
  const { value: isAm, setValue: setIsAm } = useViewModelInstanceBoolean(
    "am_db_bool",
    viewModelInstance
  );

  const [activeSegment, setActiveSegment] = useState<TimeSegment | null>(null);
  const [draftHour, setDraftHour] = useState("");
  const [draftMinute, setDraftMinute] = useState("");
  const hourInputRef = useRef<HTMLInputElement | null>(null);
  const minuteInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (hour !== null) {
      setDraftHour(pad2(clampInt(Math.round(hour), 1, 12)));
    }
  }, [hour]);

  useEffect(() => {
    if (minute !== null) {
      setDraftMinute(pad2(clampInt(Math.round(minute), 0, 59)));
    }
  }, [minute]);

  useEffect(() => {
    if (activeSegment === "hour") {
      hourInputRef.current?.focus();
      hourInputRef.current?.select();
    } else if (activeSegment === "minute") {
      minuteInputRef.current?.focus();
      minuteInputRef.current?.select();
    }
  }, [activeSegment]);

  const commitHour = (raw: string) => {
    const digits = raw.replace(/\D/g, "");
    if (!digits) {
      setDraftHour(pad2(hour ?? 12));
      return;
    }
    const next = clampInt(Number(digits), 1, 12);
    setHour(next);
    setDraftHour(pad2(next));
  };

  const commitMinute = (raw: string) => {
    const digits = raw.replace(/\D/g, "");
    if (digits === "") {
      setDraftMinute(pad2(minute ?? 0));
      return;
    }
    const next = clampInt(Number(digits), 0, 59);
    setMinute(next);
    setDraftMinute(pad2(next));
  };

  const disabled = hour === null || minute === null || isAm === null;

  return (
    <div className="graphics-gen__field">
      <span>Time</span>
      <div className={`graphics-gen__time-row${disabled ? " is-disabled" : ""}`}>
        <div className="graphics-gen__time">
          <button
            type="button"
            className={`graphics-gen__time-segment${activeSegment === "hour" ? " is-active" : ""}`}
            onClick={() => setActiveSegment("hour")}
            disabled={disabled}
            aria-label="Hour"
          >
            {activeSegment === "hour" ? (
              <input
                ref={hourInputRef}
                className="graphics-gen__time-input"
                value={draftHour}
                inputMode="numeric"
                maxLength={2}
                onChange={(event) => {
                  const next = event.target.value.replace(/\D/g, "").slice(0, 2);
                  setDraftHour(next);
                  if (next.length === 2) {
                    commitHour(next);
                    setActiveSegment("minute");
                  }
                }}
                onBlur={() => {
                  commitHour(draftHour);
                  setActiveSegment((current) => (current === "hour" ? null : current));
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    commitHour(draftHour);
                    setActiveSegment("minute");
                  } else if (event.key === "ArrowRight" || event.key === ":") {
                    event.preventDefault();
                    commitHour(draftHour);
                    setActiveSegment("minute");
                  }
                }}
              />
            ) : (
              pad2(hour ?? 12)
            )}
          </button>
          <span className="graphics-gen__time-colon" aria-hidden="true">
            :
          </span>
          <button
            type="button"
            className={`graphics-gen__time-segment${
              activeSegment === "minute" ? " is-active" : ""
            }`}
            onClick={() => setActiveSegment("minute")}
            disabled={disabled}
            aria-label="Minute"
          >
            {activeSegment === "minute" ? (
              <input
                ref={minuteInputRef}
                className="graphics-gen__time-input"
                value={draftMinute}
                inputMode="numeric"
                maxLength={2}
                onChange={(event) => {
                  const next = event.target.value.replace(/\D/g, "").slice(0, 2);
                  setDraftMinute(next);
                  if (next.length === 2) {
                    commitMinute(next);
                    setActiveSegment(null);
                  }
                }}
                onBlur={() => {
                  commitMinute(draftMinute);
                  setActiveSegment((current) => (current === "minute" ? null : current));
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    commitMinute(draftMinute);
                    setActiveSegment(null);
                  } else if (event.key === "ArrowLeft") {
                    event.preventDefault();
                    commitMinute(draftMinute);
                    setActiveSegment("hour");
                  }
                }}
              />
            ) : (
              pad2(minute ?? 0)
            )}
          </button>
        </div>
        <select
          className="graphics-gen__time-ampm"
          value={isAm ? "AM" : "PM"}
          onChange={(event) => setIsAm(event.target.value === "AM")}
          disabled={disabled}
          aria-label="AM or PM"
        >
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
      </div>
    </div>
  );
};

type DragMode = "pan" | "scale";

type DragState = {
  mode: DragMode;
  pointerId: number;
  lastX: number;
  lastY: number;
  startDist: number;
  startScale: number;
};

const SegmentedToggle = <T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<{ id: T; label: string }>;
  ariaLabel: string;
}) => (
  <div className="graphics-gen__lang-toggle" role="group" aria-label={ariaLabel}>
    {options.map((option) => (
      <button
        key={option.id}
        type="button"
        className={`graphics-gen__lang-option${value === option.id ? " is-active" : ""}`}
        onClick={() => onChange(option.id)}
      >
        {option.label}
      </button>
    ))}
  </div>
);

type MapPose = { lat: number; lng: number; zoom: number };

const MapUnderlay = ({
  active,
  searchQuery,
  selectedPlace,
  onStatus,
  mapRef,
}: {
  active: boolean;
  searchQuery: string;
  selectedPlace: google.maps.places.Place | null;
  onStatus: (message: string | null) => void;
  mapRef: React.MutableRefObject<google.maps.Map | null>;
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;

  useEffect(() => {
    if (!active) {
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        const g = await loadGoogleMaps();
        if (cancelled || !hostRef.current) {
          return;
        }
        if (!mapRef.current) {
          mapRef.current = new g.maps.Map(hostRef.current, {
            center: { lat: 40.4406, lng: -79.9959 },
            zoom: 16,
            mapTypeId: "roadmap",
            disableDefaultUI: true,
            zoomControl: true,
            gestureHandling: "greedy",
            clickableIcons: false,
            keyboardShortcuts: false,
          });
          geocoderRef.current = new g.maps.Geocoder();
        } else if (hostRef.current && mapRef.current.getDiv() !== hostRef.current) {
          mapRef.current = new g.maps.Map(hostRef.current, {
            center: mapRef.current.getCenter() || { lat: 40.4406, lng: -79.9959 },
            zoom: mapRef.current.getZoom() || 16,
            mapTypeId: "roadmap",
            disableDefaultUI: true,
            zoomControl: true,
            gestureHandling: "greedy",
            clickableIcons: false,
            keyboardShortcuts: false,
          });
          geocoderRef.current = new g.maps.Geocoder();
        } else {
          g.maps.event.trigger(mapRef.current, "resize");
        }
        onStatusRef.current(null);
      } catch (error) {
        onStatusRef.current(
          error instanceof Error ? error.message : "Could not load Google Maps."
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [active, mapRef]);

  useEffect(() => {
    if (!active || !mapRef.current) {
      return;
    }

    let cancelled = false;

    const focusGeometry = (options: {
      viewport?: google.maps.LatLngBounds | google.maps.LatLngBoundsLiteral | null;
      location?: google.maps.LatLng | google.maps.LatLngLiteral | null;
    }) => {
      if (!mapRef.current) {
        return;
      }
      if (options.viewport) {
        mapRef.current.fitBounds(options.viewport);
      } else if (options.location) {
        mapRef.current.setCenter(options.location);
        mapRef.current.setZoom(17);
      }
    };

    (async () => {
      if (selectedPlace) {
        try {
          await selectedPlace.fetchFields({
            fields: ["location", "viewport", "displayName", "formattedAddress"],
          });
          if (cancelled) {
            return;
          }
          onStatusRef.current(null);
          focusGeometry({
            viewport: selectedPlace.viewport,
            location: selectedPlace.location,
          });
        } catch {
          if (!cancelled) {
            onStatusRef.current("Could not open that place.");
          }
        }
        return;
      }

      if (!searchQuery.trim() || !geocoderRef.current) {
        return;
      }

      geocoderRef.current.geocode({ address: searchQuery.trim() }, (results, status) => {
        if (cancelled) {
          return;
        }
        if (status !== "OK" || !results?.[0]?.geometry) {
          onStatusRef.current("Could not find that location.");
          return;
        }
        onStatusRef.current(null);
        focusGeometry({
          viewport: results[0].geometry.viewport,
          location: results[0].geometry.location,
        });
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [active, mapRef, searchQuery, selectedPlace]);

  useEffect(() => {
    if (!active || !mapRef.current || !hostRef.current) {
      return;
    }
    const map = mapRef.current;
    const observer = new ResizeObserver(() => {
      window.google?.maps.event.trigger(map, "resize");
    });
    observer.observe(hostRef.current);
    return () => observer.disconnect();
  }, [active, mapRef]);

  if (!active) {
    return null;
  }

  return <div className="graphics-gen__map-underlay" ref={hostRef} />;
};

function readMapPose(map: google.maps.Map | null): MapPose | null {
  const center = map?.getCenter();
  const zoom = map?.getZoom();
  if (!center || zoom === undefined) {
    return null;
  }
  return { lat: center.lat(), lng: center.lng(), zoom };
}

const ImageTransformGizmo = ({
  hostRef,
  rive,
  viewModelInstance,
  active,
  setActive,
  enabled,
}: {
  hostRef: React.RefObject<HTMLDivElement | null>;
  rive: Rive | null;
  viewModelInstance: ViewModelInstance | null;
  active: boolean;
  setActive: (active: boolean) => void;
  enabled: boolean;
}) => {
  const { value: xOffset, setValue: setXOffset } = useViewModelInstanceNumber(
    "x_offset_db_num",
    viewModelInstance
  );
  const { value: yOffset, setValue: setYOffset } = useViewModelInstanceNumber(
    "y_offset_db_num",
    viewModelInstance
  );
  const { value: scaleFac, setValue: setScaleFac } = useViewModelInstanceNumber(
    "scalefac_db_num",
    viewModelInstance
  );

  const [layout, setLayout] = useState<LayoutMap | null>(null);
  const [artboardSize, setArtboardSize] = useState({ width: 540, height: 675 });
  const dragRef = useRef<DragState | null>(null);
  const [cursor, setCursor] = useState<"default" | "move" | "nwse-resize">("default");

  const refreshLayout = useCallback(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }
    const rect = host.getBoundingClientRect();
    const width = rive?.artboardWidth || 540;
    const height = rive?.artboardHeight || 675;
    setArtboardSize({ width, height });
    setLayout(getContainLayout(rect.width, rect.height, width, height));
  }, [hostRef, rive]);

  useEffect(() => {
    refreshLayout();
    const host = hostRef.current;
    if (!host) {
      return;
    }
    const observer = new ResizeObserver(() => refreshLayout());
    observer.observe(host);
    window.addEventListener("resize", refreshLayout);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", refreshLayout);
    };
  }, [hostRef, refreshLayout, rive]);

  useEffect(() => {
    if (!active || !enabled) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      const host = hostRef.current;
      if (!host) {
        return;
      }
      if (!host.contains(event.target as Node)) {
        setActive(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [active, enabled, hostRef, setActive]);

  useEffect(() => {
    if (!enabled && active) {
      setActive(false);
    }
  }, [active, enabled, setActive]);

  const safeX = xOffset ?? 0;
  const safeY = yOffset ?? 0;
  const safeScale = scaleFac ?? 100;

  const center = useMemo(() => {
    if (!layout) {
      return { x: 0, y: 0 };
    }
    return {
      x: layout.offsetX + (artboardSize.width / 2 + safeX) * layout.scale,
      y: layout.offsetY + (artboardSize.height / 2 + safeY) * layout.scale,
    };
  }, [artboardSize.height, artboardSize.width, layout, safeX, safeY]);

  const ringRadius = RING_BASE_PX * (safeScale / 100);

  const hitTest = (localX: number, localY: number): DragMode => {
    const dx = localX - center.x;
    const dy = localY - center.y;
    const dist = Math.hypot(dx, dy);
    if (Math.abs(dist - ringRadius) <= 12) {
      return "scale";
    }
    return "pan";
  };

  if (!enabled) {
    return null;
  }

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setActive(true);
    refreshLayout();
    const rect = event.currentTarget.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    const mode = hitTest(localX, localY);
    const dist = Math.max(8, Math.hypot(localX - center.x, localY - center.y));
    dragRef.current = {
      mode,
      pointerId: event.pointerId,
      lastX: event.clientX,
      lastY: event.clientY,
      startDist: dist,
      startScale: safeScale,
    };
    setCursor(mode === "scale" ? "nwse-resize" : "move");
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !layout) {
      if (active) {
        const rect = event.currentTarget.getBoundingClientRect();
        const mode = hitTest(event.clientX - rect.left, event.clientY - rect.top);
        setCursor(mode === "scale" ? "nwse-resize" : "move");
      }
      return;
    }

    if (drag.mode === "pan") {
      const dx = (event.clientX - drag.lastX) / layout.scale;
      const dy = (event.clientY - drag.lastY) / layout.scale;
      setXOffset(safeX + dx);
      setYOffset(safeY + dy);
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    const dist = Math.max(8, Math.hypot(localX - center.x, localY - center.y));
    const nextScale = clamp(
      Math.round(drag.startScale * (dist / drag.startDist)),
      SCALE_MIN,
      SCALE_MAX
    );
    setScaleFac(nextScale);
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
      setCursor("move");
    }
  };

  return (
    <div
      className={`graphics-gen__gizmo-layer${active ? " is-active" : ""}`}
      style={{ cursor: active ? cursor : "default" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {active && layout ? (
        <svg className="graphics-gen__gizmo" width="100%" height="100%" aria-hidden="true">
          <line
            x1={center.x - 10}
            y1={center.y}
            x2={center.x + 10}
            y2={center.y}
            className="graphics-gen__gizmo-cross"
          />
          <line
            x1={center.x}
            y1={center.y - 10}
            x2={center.x}
            y2={center.y + 10}
            className="graphics-gen__gizmo-cross"
          />
          <circle
            cx={center.x}
            cy={center.y}
            r={ringRadius}
            className="graphics-gen__gizmo-ring"
          />
          <circle cx={center.x} cy={center.y} r={5} className="graphics-gen__gizmo-center" />
        </svg>
      ) : null}
    </div>
  );
};

const RivePane = ({
  spanish,
  gizmoEnabled,
  gizmoActive,
  setGizmoActive,
  onReady,
  label,
  framing,
}: {
  spanish: boolean;
  gizmoEnabled: boolean;
  gizmoActive: boolean;
  setGizmoActive: (active: boolean) => void;
  onReady: (payload: {
    rive: Rive;
    viewModelInstance: ViewModelInstance;
    host: HTMLDivElement;
  }) => void;
  label?: string;
  framing?: boolean;
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const { rive, RiveComponent } = useRive({
    src: RIV_SRC,
    artboard: ARTBOARD,
    stateMachines: STATE_MACHINE,
    autoplay: true,
    autoBind: true,
    layout: new Layout({
      fit: Fit.Contain,
      alignment: Alignment.Center,
    }),
  });

  const viewModelInstance = rive?.viewModelInstance ?? null;

  useEffect(() => {
    if (!rive) {
      return;
    }
    rive.resizeDrawingSurfaceToCanvas();
    const onResize = () => rive.resizeDrawingSurfaceToCanvas();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [rive]);

  useEffect(() => {
    if (!viewModelInstance) {
      return;
    }
    const spanishProp = viewModelInstance.boolean("spanish_db_bool");
    if (spanishProp) {
      spanishProp.value = spanish;
    }
  }, [spanish, viewModelInstance]);

  useEffect(() => {
    if (!rive || !viewModelInstance || !hostRef.current) {
      return;
    }
    onReady({ rive, viewModelInstance, host: hostRef.current });
  }, [onReady, rive, viewModelInstance]);

  return (
    <div className={`graphics-gen__pane${framing ? " is-framing" : ""}`}>
      {label ? <div className="graphics-gen__pane-label">{label}</div> : null}
      <div className="graphics-gen__canvas-wrap" ref={hostRef}>
        <RiveComponent className="graphics-gen__canvas" />
        <ImageTransformGizmo
          hostRef={hostRef}
          rive={rive}
          viewModelInstance={viewModelInstance}
          active={gizmoActive}
          setActive={setGizmoActive}
          enabled={gizmoEnabled}
        />
      </div>
    </div>
  );
};

const GraphicsGeneratorPage = ({ setPage }: { setPage: pagesetter }) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const [imageName, setImageName] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [gizmoActive, setGizmoActive] = useState(false);
  const [langMode, setLangMode] = useState<LangMode>("english");
  const [mediaMode, setMediaMode] = useState<MediaMode>("image");
  const [mapFraming, setMapFraming] = useState(false);
  const [locationDraft, setLocationDraft] = useState("");
  const [mapSearchQuery, setMapSearchQuery] = useState("");
  const [selectedPlace, setSelectedPlace] = useState<google.maps.places.Place | null>(null);
  const [mapStatus, setMapStatus] = useState<string | null>(null);
  const [confirmingMap, setConfirmingMap] = useState(false);
  const [placeSuggestions, setPlaceSuggestions] = useState<
    Array<{ id: string; description: string; prediction: google.maps.places.PlacePrediction }>
  >([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const autocompleteSessionTokenRef =
    useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const suggestionRequestIdRef = useRef(0);
  const locationFieldRef = useRef<HTMLDivElement | null>(null);

  const masterRef = useRef<{
    rive: Rive;
    viewModelInstance: ViewModelInstance;
    host: HTMLDivElement;
  } | null>(null);
  const secondaryRef = useRef<{
    rive: Rive;
    viewModelInstance: ViewModelInstance;
    host: HTMLDivElement;
  } | null>(null);
  const lastImageBytesRef = useRef<Uint8Array | null>(null);
  const didInitDefaultsRef = useRef(false);
  const [masterTick, setMasterTick] = useState(0);
  const [secondaryTick, setSecondaryTick] = useState(0);

  const mapsConfigured = Boolean(getGoogleMapsApiKey());
  const framingActive = mediaMode === "map" && mapFraming;

  const onMasterReady = useCallback(
    (payload: { rive: Rive; viewModelInstance: ViewModelInstance; host: HTMLDivElement }) => {
      masterRef.current = payload;
      if (!didInitDefaultsRef.current) {
        didInitDefaultsRef.current = true;
        applyNowDefaults(payload.viewModelInstance);
      }
      setMasterTick((value) => value + 1);
    },
    []
  );

  const onSecondaryReady = useCallback(
    (payload: { rive: Rive; viewModelInstance: ViewModelInstance; host: HTMLDivElement }) => {
      secondaryRef.current = payload;
      const spanish = payload.viewModelInstance.boolean("spanish_db_bool");
      if (spanish) {
        spanish.value = true;
      }
      setSecondaryTick((value) => value + 1);
    },
    []
  );

  useEffect(() => {
    const master = masterRef.current?.viewModelInstance;
    if (!master) {
      return;
    }
    const spanish = master.boolean("spanish_db_bool");
    if (!spanish) {
      return;
    }
    if (langMode === "english") {
      spanish.value = false;
    } else if (langMode === "spanish") {
      spanish.value = true;
    } else {
      spanish.value = false;
    }
  }, [langMode, masterTick]);

  useEffect(() => {
    if (langMode !== "both") {
      secondaryRef.current = null;
      return;
    }
    const master = masterRef.current?.viewModelInstance;
    const secondary = secondaryRef.current?.viewModelInstance;
    if (!master || !secondary) {
      return;
    }

    let raf = 0;
    const loop = () => {
      syncViewModelExceptSpanish(master, secondary);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [langMode, masterTick, secondaryTick]);

  useEffect(() => {
    if (langMode !== "both") {
      return;
    }
    const secondary = secondaryRef.current?.viewModelInstance;
    const bytes = lastImageBytesRef.current;
    if (!secondary || !bytes) {
      return;
    }
    let cancelled = false;
    (async () => {
      const decoded = await decodeImage(bytes);
      if (cancelled) {
        decoded.unref();
        return;
      }
      secondary.image(IMAGE_PATH)!.value = decoded;
      decoded.unref();
    })();
    return () => {
      cancelled = true;
    };
  }, [langMode, secondaryTick]);

  const applyImageBytes = useCallback(async (bytes: Uint8Array, fileName: string) => {
    lastImageBytesRef.current = bytes;
    const decoded = await decodeImage(bytes);
    const masterImage = masterRef.current?.viewModelInstance.image(IMAGE_PATH);
    if (masterImage) {
      masterImage.value = decoded;
    }
    const secondaryImage = secondaryRef.current?.viewModelInstance.image(IMAGE_PATH);
    if (secondaryImage) {
      secondaryImage.value = decoded;
    }
    decoded.unref();
    setImageName(fileName);
  }, []);

  const clearGraphicImage = useCallback(() => {
    lastImageBytesRef.current = null;
    const masterImage = masterRef.current?.viewModelInstance.image(IMAGE_PATH);
    if (masterImage) {
      masterImage.value = null;
    }
    const secondaryImage = secondaryRef.current?.viewModelInstance.image(IMAGE_PATH);
    if (secondaryImage) {
      secondaryImage.value = null;
    }
    setImageName(null);
  }, []);

  const applyImageFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) {
        setExportError("Please choose an image file.");
        return;
      }
      setExportError(null);
      const buffer = await file.arrayBuffer();
      await applyImageBytes(new Uint8Array(buffer), file.name);
    },
    [applyImageBytes]
  );

  const onFileInputChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      await applyImageFile(file);
    }
    event.target.value = "";
  };

  const onDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      await applyImageFile(file);
    }
  };

  const handleMediaModeChange = (mode: MediaMode) => {
    setMediaMode(mode);
    setExportError(null);
    setMapStatus(null);
    if (mode === "map") {
      if (!mapsConfigured) {
        setMapStatus("Add REACT_APP_GOOGLE_MAPS_API_KEY to frontend/.env.local and restart.");
        setMapFraming(false);
        return;
      }
      clearGraphicImage();
      setMapFraming(true);
      setGizmoActive(false);
    } else {
      setMapFraming(false);
    }
  };

  useEffect(() => {
    if (mediaMode !== "map" || !mapsConfigured) {
      setPlaceSuggestions([]);
      return;
    }

    const query = locationDraft.trim();
    if (query.length < 2) {
      setPlaceSuggestions([]);
      return;
    }

    let cancelled = false;
    const requestId = ++suggestionRequestIdRef.current;
    const timeout = window.setTimeout(async () => {
      try {
        const g = await loadGoogleMaps();
        if (cancelled) {
          return;
        }
        const { AutocompleteSuggestion, AutocompleteSessionToken } =
          (await g.maps.importLibrary("places")) as google.maps.PlacesLibrary;

        if (!autocompleteSessionTokenRef.current) {
          autocompleteSessionTokenRef.current = new AutocompleteSessionToken();
        }

        const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: query,
          sessionToken: autocompleteSessionTokenRef.current,
        });

        if (cancelled || requestId !== suggestionRequestIdRef.current) {
          return;
        }

        const nextSuggestions = suggestions
          .map((suggestion, index) => {
            const prediction = suggestion.placePrediction;
            if (!prediction) {
              return null;
            }
            return {
              id: `${prediction.placeId || "prediction"}-${index}`,
              description: prediction.text.toString(),
              prediction,
            };
          })
          .filter(
            (
              suggestion
            ): suggestion is {
              id: string;
              description: string;
              prediction: google.maps.places.PlacePrediction;
            } => Boolean(suggestion)
          )
          .slice(0, 6);

        setPlaceSuggestions(nextSuggestions);
        setSuggestionsOpen(nextSuggestions.length > 0);
      } catch (error) {
        if (!cancelled) {
          setPlaceSuggestions([]);
          setMapStatus(
            error instanceof Error
              ? error.message
              : "Places autocomplete failed. Enable Places API (New) for this key."
          );
        }
      }
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [locationDraft, mapsConfigured, mediaMode]);

  useEffect(() => {
    if (!suggestionsOpen) {
      return;
    }
    const onPointerDown = (event: MouseEvent) => {
      if (!locationFieldRef.current?.contains(event.target as Node)) {
        setSuggestionsOpen(false);
      }
    };
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [suggestionsOpen]);

  const handleMapSearch = () => {
    const next = locationDraft.trim();
    if (!next) {
      setMapStatus("Enter a location to search.");
      return;
    }
    setSelectedPlace(null);
    setMapSearchQuery(next);
    setSuggestionsOpen(false);
  };

  const handleSuggestionSelect = async (suggestion: {
    description: string;
    prediction: google.maps.places.PlacePrediction;
  }) => {
    setLocationDraft(suggestion.description);
    setPlaceSuggestions([]);
    setSuggestionsOpen(false);
    setMapStatus(null);
    try {
      const place = suggestion.prediction.toPlace();
      setSelectedPlace(place);
      setMapSearchQuery(suggestion.description);
      autocompleteSessionTokenRef.current = null;
    } catch (error) {
      setMapStatus(
        error instanceof Error ? error.message : "Could not select that place."
      );
    }
  };

  const handleConfirmMap = async () => {
    setExportError(null);
    setMapStatus(null);
    const pose = readMapPose(mapRef.current);
    if (!pose) {
      setMapStatus("Map is still loading — try again in a moment.");
      return;
    }
    setConfirmingMap(true);
    try {
      const bytes = await fetchStaticMapBytes(pose);
      await applyImageBytes(bytes, `map-${pose.lat.toFixed(4)}_${pose.lng.toFixed(4)}.png`);
      setMapFraming(false);
    } catch (error) {
      setMapStatus(
        error instanceof Error
          ? error.message
          : "Could not capture map. Enable Maps JavaScript + Static Maps APIs for this key."
      );
    } finally {
      setConfirmingMap(false);
    }
  };

  const handleExport = async () => {
    setExportError(null);
    setExporting(true);

    try {
      const masterVmi = masterRef.current?.viewModelInstance;
      const enName = buildExportFilename(masterVmi, "ENGLISH");
      const esName = buildExportFilename(masterVmi, "SPANISH");

      if (langMode === "both") {
        const enCanvas = masterRef.current?.host.querySelector("canvas");
        const esCanvas = secondaryRef.current?.host.querySelector("canvas");
        if (!(enCanvas instanceof HTMLCanvasElement) || !(esCanvas instanceof HTMLCanvasElement)) {
          setExportError("Graphics are still loading — try again in a moment.");
          return;
        }
        downloadCanvasPng(enCanvas, enName);
        downloadCanvasPng(esCanvas, esName);
        return;
      }

      const master = masterRef.current;
      const canvas = master?.host.querySelector("canvas");
      const spanish = master?.viewModelInstance.boolean("spanish_db_bool");
      if (!(canvas instanceof HTMLCanvasElement) || !spanish) {
        setExportError("Graphic is still loading — try again in a moment.");
        return;
      }

      spanish.value = false;
      await waitFrames(3);
      downloadCanvasPng(canvas, enName);

      spanish.value = true;
      await waitFrames(3);
      downloadCanvasPng(canvas, esName);

      if (langMode === "english") {
        spanish.value = false;
      } else if (langMode === "spanish") {
        spanish.value = true;
      }
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Could not export PNG.");
    } finally {
      setExporting(false);
    }
  };

  const showBoth = langMode === "both";
  const controlVmi = masterTick > 0 ? masterRef.current?.viewModelInstance ?? null : null;
  const gizmoAllowed = !showBoth && !framingActive;

  return (
    <div className="page-shell graphics-gen">
      <PageHeader title="GRAPHICS GENERATOR" setPage={setPage} hue={200} />
      <div className="graphics-gen__layout">
        <div className="graphics-gen__stage">
          <SegmentedToggle
            ariaLabel="Language preview"
            value={langMode}
            onChange={setLangMode}
            options={[
              { id: "english", label: "English" },
              { id: "spanish", label: "Spanish" },
              { id: "both", label: "Both" },
            ]}
          />

          <div className={`graphics-gen__preview-stack${framingActive ? " is-framing" : ""}`}>
            <MapUnderlay
              active={framingActive}
              searchQuery={mapSearchQuery}
              selectedPlace={selectedPlace}
              onStatus={setMapStatus}
              mapRef={mapRef}
            />
            <div className={`graphics-gen__panes${showBoth ? " is-both" : ""}`}>
              <RivePane
                key="master"
                spanish={langMode === "spanish"}
                gizmoEnabled={gizmoAllowed}
                gizmoActive={gizmoActive}
                setGizmoActive={setGizmoActive}
                onReady={onMasterReady}
                label={showBoth ? "English" : undefined}
                framing={framingActive}
              />
              {showBoth ? (
                <RivePane
                  key="secondary-es"
                  spanish
                  gizmoEnabled={false}
                  gizmoActive={false}
                  setGizmoActive={() => undefined}
                  onReady={onSecondaryReady}
                  label="Spanish"
                  framing={framingActive}
                />
              ) : null}
            </div>
          </div>

          <p className="graphics-gen__gizmo-hint">
            {framingActive
              ? "Map framing: pan/zoom the map behind the graphic, then hit Confirm map frame."
              : showBoth
                ? "Gizmo is hidden in Both view. Switch to English or Spanish to move/scale the image."
                : "Click the graphic to show the move/scale gizmo. Click outside to hide it."}
          </p>
        </div>

        <aside className="graphics-gen__controls">
          <section className="graphics-gen__section">
            <h2>Text</h2>
            {STRING_FIELDS.map((field) => (
              <BoundStringField
                key={field.path}
                path={field.path}
                label={field.label}
                viewModelInstance={controlVmi}
              />
            ))}
          </section>

          <section className="graphics-gen__section">
            <h2>Date & time</h2>
            <BoundDateField viewModelInstance={controlVmi} />
            <BoundTimeField viewModelInstance={controlVmi} />
          </section>

          <section className="graphics-gen__section">
            <h2>Details</h2>
            <BoundDetainedField viewModelInstance={controlVmi} />
          </section>

          <section className="graphics-gen__section">
            <h2>Image</h2>
            <SegmentedToggle
              ariaLabel="Image source"
              value={mediaMode}
              onChange={handleMediaModeChange}
              options={[
                { id: "image", label: "Use image" },
                { id: "map", label: "Use map" },
              ]}
            />

            {mediaMode === "image" ? (
              <div
                className={`graphics-gen__dropzone${isDragging ? " is-dragging" : ""}`}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setIsDragging(true);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={(event) => {
                  event.preventDefault();
                  setIsDragging(false);
                }}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
              >
                <p>
                  {imageName
                    ? `Using ${imageName}`
                    : "Drop an image here, or click to upload"}
                </p>
                <p className="graphics-gen__dropzone-hint">Replaces graphic_db_img</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="graphics-gen__file-input"
                  onChange={onFileInputChange}
                />
              </div>
            ) : (
              <div className="graphics-gen__map-controls">
                <div className="graphics-gen__field" ref={locationFieldRef}>
                  <span>Location</span>
                  <div className="graphics-gen__map-search-row">
                    <input
                      type="text"
                      value={locationDraft}
                      placeholder="Address or place"
                      autoComplete="off"
                      onChange={(event) => {
                        setLocationDraft(event.target.value);
                        setSelectedPlace(null);
                        setSuggestionsOpen(true);
                      }}
                      onFocus={() => {
                        if (placeSuggestions.length) {
                          setSuggestionsOpen(true);
                        }
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          if (placeSuggestions[0]) {
                            handleSuggestionSelect(placeSuggestions[0]);
                          } else {
                            handleMapSearch();
                          }
                        } else if (event.key === "Escape") {
                          setSuggestionsOpen(false);
                        }
                      }}
                    />
                    <button type="button" onClick={handleMapSearch}>
                      Go
                    </button>
                  </div>
                  {suggestionsOpen && placeSuggestions.length > 0 ? (
                    <ul className="graphics-gen__suggestions" role="listbox">
                      {placeSuggestions.map((suggestion) => (
                        <li key={suggestion.id}>
                          <button
                            type="button"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => handleSuggestionSelect(suggestion)}
                          >
                            {suggestion.description}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                {mapFraming ? (
                  <button
                    type="button"
                    className="graphics-gen__export"
                    onClick={handleConfirmMap}
                    disabled={confirmingMap || !mapsConfigured}
                  >
                    {confirmingMap ? "Capturing…" : "Confirm map frame"}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="graphics-gen__map-reframe"
                    onClick={() => {
                      clearGraphicImage();
                      setMapFraming(true);
                      setGizmoActive(false);
                    }}
                    disabled={!mapsConfigured}
                  >
                    Reframe map
                  </button>
                )}
                {imageName ? (
                  <p className="graphics-gen__dropzone-hint">Current graphic: {imageName}</p>
                ) : null}
                {mapStatus ? <p className="graphics-gen__error">{mapStatus}</p> : null}
              </div>
            )}
          </section>

          <div className="graphics-gen__export-row">
            <button
              type="button"
              className="graphics-gen__export"
              onClick={handleExport}
              disabled={exporting}
            >
              {exporting ? "Exporting…" : "Export graphic"}
            </button>
            <p className="graphics-gen__dropzone-hint">Exports English and Spanish PNGs</p>
            {exportError ? <p className="graphics-gen__error">{exportError}</p> : null}
          </div>
        </aside>
      </div>
    </div>
  );
};

export default function GraphicsGenerator(
  _timer: number,
  setPage: pagesetter,
  _mouse: Point,
  _extravars: reactvar[],
  _viewport: Viewport
) {
  return <GraphicsGeneratorPage setPage={setPage} />;
}
