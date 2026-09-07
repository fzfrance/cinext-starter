"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Icon from "@/components/ui/Icon";
import PosterArt from "@/components/ui/PosterArt";
import { useShowCustomizations } from "@/lib/show-customizations-context";
import { useLongPress } from "@/lib/useLongPress";
import { toTmdbLanguage } from "@/lib/languageCodes";
import { useAppLanguage, resolveTitle, useReadableLanguages } from "@/lib/languages";
import { DEFAULT_ACCENT } from "@/lib/theme";

const accent = DEFAULT_ACCENT;

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parseAirDateParts(airDateStr) {
  const [year, month, day] = airDateStr.split("-").map(Number);
  return { year, month, day };
}

function formatFullDate(airDateStr, localeTag = "en-US") {
  const { year, month, day } = parseAirDateParts(airDateStr);
  try {
    return new Intl.DateTimeFormat(localeTag, {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(year, month - 1, day)));
  } catch {
    return `${MONTH_NAMES[month - 1]} ${day}, ${year}`;
  }
}

function bangkokTodayParts() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

function calendarDayDiff(from, to) {
  return Math.round((Date.UTC(to.year, to.month - 1, to.day) - Date.UTC(from.year, from.month - 1, from.day)) / 86400000);
}

function getCountdown(airDateStr, tr) {
  if (!airDateStr) return { label: tr("tba"), isToday: false };
  const diffDays = calendarDayDiff(bangkokTodayParts(), parseAirDateParts(airDateStr));
  if (diffDays < 0) return { label: tr("aired"), isToday: false };
  if (diffDays === 0) return { label: tr("today"), isToday: true };
  if (diffDays === 1) return { label: tr("tomorrow"), isToday: false };
  return { label: tr("inDays", { n: diffDays }), isToday: false };
}

function itemDateStr(item) {
  return item.mediaType === "movie" ? item.releaseDate : item.airDate;
}

function itemTitle(item, readableLanguages) {
  if (item.mediaType === "movie") {
    return resolveTitle(
      { title: item.title, originalTitle: item.originalTitle, originalLanguage: item.originalLanguage },
      readableLanguages
    ) || item.title;
  }
  return resolveTitle(
    {
      title: item.show?.title,
      originalTitle: item.show?.originalTitle,
      originalLanguage: item.show?.originalLanguage,
    },
    readableLanguages
  ) || item.show?.title;
}

function itemMeta(item, tr) {
  if (item.mediaType === "movie") return tr("movie");
  return [
    item.season != null ? tr("seasonN", { n: item.season }) : null,
    item.episode != null ? tr("episodeN", { n: item.episode }) : null,
  ].filter(Boolean).join(" · ");
}

function monthShift(base, delta) {
  const monthIndex = base.month - 1 + delta;
  const year = base.year + Math.floor(monthIndex / 12);
  const month = ((monthIndex % 12) + 12) % 12 + 1;
  return { year, month };
}

function matchesMonthFilter(dateStr, filter) {
  if (filter === "all" || !dateStr) return filter === "all";
  const parts = parseAirDateParts(dateStr);
  const today = bangkokTodayParts();
  const target = filter === "this" ? { year: today.year, month: today.month } : monthShift(today, 1);
  return parts.year === target.year && parts.month === target.month;
}

function UpcomingModalCard({ item, onLongPress, onNavigate, tr, readableLanguages, dateLocale }) {
  const { getCustomPoster } = useShowCustomizations();
  const isMovie = item.mediaType === "movie";
  const longPress = useLongPress((rect) => {
    if (isMovie || !onLongPress) return;
    onLongPress({ id: item.id, title: item.show.title }, rect);
  });
  const dateStr = itemDateStr(item);
  const { label, isToday } = getCountdown(dateStr, tr);
  const title = itemTitle(item, readableLanguages);
  const meta = itemMeta(item, tr);
  const posterPath = isMovie ? item.posterPath : item.show?.posterPath;

  return (
    <button
      type="button"
      className="upcoming-all-card"
      onClick={() => {
        if (!isMovie && longPress.consumeClick()) return;
        onNavigate(isMovie ? `/movie/${item.id}` : `/show/${item.id}`);
      }}
      {...(isMovie ? {} : longPress.handlers)}
    >
      <div className="upcoming-all-card-thumb">
        <PosterArt
          posterPath={posterPath}
          overrideSrc={isMovie ? null : getCustomPoster(item.id)}
          base={item.show?.base}
          glow={isMovie ? accent : item.show?.glow}
          alt={title}
          flat
          objectFit="contain"
          tmdbSize="w342"
          sizes="72px"
        />
      </div>
      <div className="upcoming-all-card-copy">
        <div className="upcoming-all-card-title">{title}</div>
        {meta ? <div className="upcoming-all-card-meta">{meta}</div> : null}
        <div className="upcoming-all-card-date">
          {dateStr ? formatFullDate(dateStr, dateLocale) : (item.tmdbStatus || tr("tba"))}
        </div>
      </div>
      {dateStr ? (
        <span className={`upcoming-all-card-badge${isToday ? " is-today" : ""}`}>{label}</span>
      ) : null}
    </button>
  );
}

/**
 * Desktop mid-screen “See All” for Upcoming — searchable, filterable, sortable.
 */
export default function UpcomingAllModal({ open, items, onClose, onLongPress }) {
  const router = useRouter();
  const { t: tr, code: appLanguage } = useAppLanguage();
  const dateLocale = toTmdbLanguage(appLanguage);
  const readableLanguages = useReadableLanguages();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("soonest");
  const [sortOpen, setSortOpen] = useState(false);

  const sortOptions = useMemo(
    () => [
      { id: "soonest", label: tr("soonest") },
      { id: "az", label: tr("sortAZ") },
      { id: "za", label: tr("sortZA") },
    ],
    [tr]
  );

  useEffect(() => {
    if (!open) return undefined;
    setQuery("");
    setFilter("all");
    setSort("soonest");
    setSortOpen(false);
    const onKey = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = (items || []).filter((item) => {
      const dateStr = itemDateStr(item);
      if (filter !== "all" && !matchesMonthFilter(dateStr, filter)) return false;
      if (!q) return true;
      return (itemTitle(item, readableLanguages) || "").toLowerCase().includes(q);
    });

    list = [...list].sort((a, b) => {
      if (sort === "az" || sort === "za") {
        const cmp = (itemTitle(a, readableLanguages) || "").localeCompare(
          itemTitle(b, readableLanguages) || "",
          undefined,
          { sensitivity: "base" }
        );
        return sort === "az" ? cmp : -cmp;
      }
      const da = itemDateStr(a) || "9999-99-99";
      const db = itemDateStr(b) || "9999-99-99";
      return da.localeCompare(db);
    });
    return list;
  }, [items, query, filter, sort, readableLanguages]);

  if (!open || typeof document === "undefined") return null;

  const sortLabel = sortOptions.find((o) => o.id === sort)?.label || tr("soonest");

  return createPortal(
    <div className="upcoming-all-scrim" role="presentation" onClick={onClose}>
      <div
        className="upcoming-all-card-panel"
        role="dialog"
        aria-modal="true"
        aria-label={tr("upcoming")}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="upcoming-all-head">
          <div className="upcoming-all-head-titles">
            <h2 className="upcoming-all-title">{tr("upcoming")}</h2>
            <span className="upcoming-all-count">
              {filtered.length === 1
                ? tr("titleCount", { n: filtered.length })
                : tr("titlesCount", { n: filtered.length })}
            </span>
          </div>
          <button type="button" className="upcoming-all-close" onClick={onClose} aria-label={tr("close")}>
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="upcoming-all-search">
          <Icon name="search" size={15} color="rgba(255,255,255,0.4)" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tr("searchTitle")}
            aria-label={tr("searchTitle")}
          />
        </div>

        <div className="upcoming-all-chips" role="group" aria-label={tr("upcoming")}>
          {[
            { id: "all", label: tr("all") },
            { id: "this", label: tr("thisMonth") },
            { id: "next", label: tr("nextMonth") },
          ].map((chip) => (
            <button
              key={chip.id}
              type="button"
              className={`upcoming-all-chip${filter === chip.id ? " is-active" : ""}`}
              aria-pressed={filter === chip.id}
              onClick={() => setFilter(chip.id)}
            >
              {chip.label}
            </button>
          ))}
          <div className="upcoming-all-sort">
            <button
              type="button"
              className={`upcoming-all-chip upcoming-all-sort-btn${sortOpen ? " is-active" : ""}`}
              aria-haspopup="listbox"
              aria-expanded={sortOpen}
              onClick={() => setSortOpen((v) => !v)}
            >
              {sortLabel}
              <Icon name="chevronDown" size={12} color={sortOpen ? "rgba(20,20,24,0.55)" : "rgba(255,255,255,0.55)"} />
            </button>
            {sortOpen ? (
              <>
                <div className="upcoming-all-sort-scrim" onClick={() => setSortOpen(false)} />
                <div className="upcoming-all-sort-menu" role="listbox">
                  {sortOptions.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      role="option"
                      aria-selected={sort === option.id}
                      className={`upcoming-all-sort-option${sort === option.id ? " is-active" : ""}`}
                      onClick={() => {
                        setSort(option.id);
                        setSortOpen(false);
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        </div>

        <div className="upcoming-all-body">
          {filtered.length === 0 ? (
            <div className="upcoming-all-empty">{tr("noUpcomingMatch")}</div>
          ) : (
            <div className="upcoming-all-grid">
              {filtered.map((item) => (
                <UpcomingModalCard
                  key={item.key || `${item.mediaType}-${item.id}`}
                  item={item}
                  tr={tr}
                  dateLocale={dateLocale}
                  readableLanguages={readableLanguages}
                  onLongPress={onLongPress}
                  onNavigate={(href) => {
                    onClose?.();
                    router.push(href);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
