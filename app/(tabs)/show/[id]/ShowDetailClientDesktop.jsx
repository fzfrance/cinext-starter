"use client";

import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import Icon from "@/components/ui/Icon";
import PosterArt from "@/components/ui/PosterArt";
import MediaStatusBadge from "@/components/ui/MediaStatusBadge";
import EpisodeRatingFlow from "@/components/EpisodeRatingFlow";
import EpisodeDetail from "@/components/EpisodeDetail";
import ImagePickerScreen from "@/components/ImagePickerScreen";
import StatusMenu, { statusMenuOptions } from "@/components/StatusMenu";
import SeasonBanner from "@/components/SeasonBanner";
import SeasonRatingScreen from "@/components/SeasonRatingScreen";
import ShareRatingCard from "@/components/ShareRatingCard";
import CollectionPickerCard from "@/components/CollectionPickerCard";
import CollectionQuickRow from "@/components/CollectionQuickRow";
import { useAuth } from "@/lib/auth-context";
import { useFavorites } from "@/lib/favorites-context";
import { useShowCustomizations } from "@/lib/show-customizations-context";
import { getEpisodeWatches, addEpisodeWatches, clearEpisodeWatches, syncEpisodeWatchCount, rateLatestWatch, getShowWatchSummary } from "@/lib/episodeWatches";
import { getEpisodeSkips, setEpisodeSkipped as persistEpisodeSkipped } from "@/lib/episodeSkips";
import { getUserShow, getUserShows, setShowStatus, removeUserShow, setWatchlistAndClearProgress, removeImplicitLibraryRow } from "@/lib/userShows";
import { getCollections, createCollection, addShowToCollection, removeShowFromCollection } from "@/lib/collections";
import { hydrateCollectionPreviews } from "@/lib/collectionPreviews";
import { getSeasonRatings, saveSeasonRating, deleteSeasonRating, getAutoSeasonScore } from "@/lib/seasonRatings";
import { getProfile } from "@/lib/profile";
import { tmdbImage } from "@/lib/tmdb";
import { resolveShowStatus } from "@/lib/statusResolver";
import { resolveTitle, useReadableLanguages, useAppLanguage } from "@/lib/languages";
import { themes, DEFAULT_ACCENT, tintColorForShow } from "@/lib/theme";
import { useNavTint } from "@/lib/nav-tint-context";
import { useNavVisibility } from "@/lib/nav-visibility-context";

const t = themes.dark;
const accent = DEFAULT_ACCENT;
// Season progress ring (SVG stroke, not conic-gradient — see the render
// site's comment) — fixed radius for a 24x24 circle at strokeWidth 2.5.
const SEASON_RING_RADIUS = 10;
const SEASON_RING_CIRCUMFERENCE = 2 * Math.PI * SEASON_RING_RADIUS;
// A skipped episode's own mark-button fill — a clear, solid grey, distinct
// from both the "not started" translucent-white fill and the amber/green
// watched fills, so Skipped reads as its own real status at a glance
// instead of a barely-there tint of the empty state.
const SKIPPED_GREY = "#6B7280";

// catches render errors in a subtree and shows a recoverable message
// instead of a blank/broken screen — used by the Cast tab / cast profile
// overlay, which does its own fetch-driven loading/error handling but
// keeps this as a defensive backstop against an unexpected render exception.
class SectionErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center text-center rounded-2xl" style={{ margin: "16px 0", padding: "28px 20px", background: t.cardFill, border: `1px solid ${t.cardBorder}` }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: "#fff" }}>Something went wrong loading this</div>
          <div style={{ fontSize: 12, color: t.textDim, marginTop: 4 }}>Try switching tabs and coming back.</div>
          <button onClick={() => this.setState({ hasError: false })} className="rounded-full active:scale-95 transition" style={{ marginTop: 14, padding: "8px 16px", background: "rgba(255,255,255,0.1)" }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "#fff" }}>Retry</span>
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function GlassButton({ children, onClick, style, ...props }) {
  return (
    <button onClick={onClick} style={{
      background: t.cardFill, color: "#fff",
      border: `1px solid ${t.glassBorder}`, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", ...style
    }} className="flex items-center justify-center gap-2 rounded-full active:scale-95 transition" {...props}>
      {children}
    </button>
  );
}

// One left-label/right-value row for the Details tab's stacked card —
// icon + label on the left (muted grey), value on the right, an
// optional top divider so adjacent rows read as one continuous card
// instead of separate boxes. `children` is the value side, not a plain
// string prop, so callers can render genre chips or a multi-line
// provider list there just as easily as plain text.
function DetailRow({ icon, label, divider = true, children }) {
  return (
    <div className="flex items-start justify-between gap-4" style={{ padding: "13px 16px", borderTop: divider ? `1px solid ${t.cardBorder}` : "none" }}>
      <div className="flex items-center gap-2 flex-shrink-0" style={{ paddingTop: 1 }}>
        <Icon name={icon} size={14} color={t.textDim} />
        <span style={{ fontSize: 12.5, color: t.textDim, fontWeight: 500 }}>{label}</span>
      </div>
      <div className="text-right min-w-0">{children}</div>
    </div>
  );
}

// One Stream/Rent/Buy group inside the Where to Watch block — a labeled
// row of provider logo + name pills. Only rendered by the caller when
// `items` is non-empty, so there's no "Rent: none" noise for shows that
// are, say, streaming-only in Thailand.
function ProviderGroup({ label, items }) {
  return (
    <div className="mb-4 last:mb-0">
      <div style={{ fontSize: 10, color: t.textDim, fontWeight: 700, letterSpacing: "0.08em", marginBottom: 9 }}>{label.toUpperCase()}</div>
      <div className="flex flex-wrap gap-4">
        {items.map((p) => (
          <div key={p.id} className="flex flex-col items-center flex-shrink-0" style={{ width: 56 }}>
            <div className="rounded-xl overflow-hidden flex-shrink-0" style={{ width: 48, height: 48, position: "relative", background: "rgba(255,255,255,0.1)" }}>
              {p.logoPath && <Image src={tmdbImage(p.logoPath, "w92")} alt="" fill sizes="48px" style={{ objectFit: "cover" }} />}
            </div>
            <span className="text-center" style={{ fontSize: 10.5, color: t.textDim, fontWeight: 500, marginTop: 6, lineHeight: 1.25 }}>{p.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Compact gallery grid for the Cast & Crew tab — replaces the old
// full-width list rows. Cast and crew render as two separate calls to
// this (cast first), not one filtered list, so the "Crew" label only
// shows up when there's actually crew data.
function CastGallery({ people, onSelect }) {
  return (
    <div className="grid mt-4" style={{ gridTemplateColumns: "repeat(3, 1fr)", rowGap: 20, columnGap: 8 }}>
      {people.map((c) => (
        <button key={c.id} onClick={() => onSelect(c.id)} className="flex flex-col items-center text-center active:scale-95 transition">
          <div className="relative flex-shrink-0 rounded-full overflow-hidden flex items-center justify-center" style={{ width: 84, height: 84, background: c.grad }}>
            {c.profilePath ? (
              <Image src={tmdbImage(c.profilePath, "w185")} alt="" fill sizes="84px" style={{ objectFit: "cover" }} />
            ) : (
              <span style={{ fontSize: 20, fontWeight: 700, color: "#fff" }}>{c.initials}</span>
            )}
          </div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: "#fff", marginTop: 8, lineHeight: 1.25 }}>{c.name}</div>
          <div style={{ fontSize: 11, color: t.textDim, marginTop: 2, lineHeight: 1.25 }}>{c.role}</div>
        </button>
      ))}
    </div>
  );
}

// id maps 1:1 to ImagePickerScreen's `type` prop except "tags" (opens the
// collection sheet, not a picker) and "covers" (labeled "covers" but maps
// to the "backdrop" TMDB image category — this app's hero art is a
// backdrop, "covers" is just the more familiar label for it).
const moreMenuItems = [
  { id: "tags", label: "Add to a Collection", icon: "collection" },
  { id: "covers", label: "Change covers", icon: "image", pickerType: "backdrop" },
  { id: "poster", label: "Change poster", icon: "image", pickerType: "poster" },
  { id: "logo", label: "Change logo", icon: "logo", pickerType: "logo" },
];


export default function ShowDetailClient({ showId, show, initialSeasons, cast, videos, similar, watchProviders }) {
  const router = useRouter();
  const { user } = useAuth();
  const { isFavorite, toggleFavorite } = useFavorites();
  const { getCustomBackdrop, getCustomPoster, getCustomLogo, setCustomImage } = useShowCustomizations();
  const readableLanguages = useReadableLanguages();
  const { t: tr } = useAppLanguage();
  // Resolved once here, per the signed-in user's Readable Languages —
  // downstream code (the hero title, the similar-shows row) just reads
  // `.title` normally.
  const displayTitle = resolveTitle(show, readableLanguages);
  const resolvedSimilar = similar.map((s) => ({ ...s, title: resolveTitle(s, readableLanguages) }));

  // Status badges for "You May Also Like" — a browsing surface, same
  // "already tracking this" glance-badge Explore's own cards show (see
  // MediaStatusBadge's own comment). Live-resolved through
  // resolveShowStatus, same as this show's own status pill below and
  // Explore's own resolvedStatusMap — a raw user_shows.status column can
  // silently drift out of sync with real watch history (e.g. every
  // episode marked watched without ever explicitly picking "Watching"
  // from the status menu), and this row must never disagree with reality
  // just because it's "only" a glance badge. `similar` (the prop, stable
  // across this component's own re-renders) is the dependency, not
  // resolvedSimilar — that's a brand-new array every render and would
  // re-fire this effect on every state change.
  const [similarStatusMap, setSimilarStatusMap] = useState({});
  useEffect(() => {
    if (!user) { setSimilarStatusMap({}); return; }
    let cancelled = false;
    (async () => {
      const byShow = await getUserShows(user.id);
      const ids = similar.map((s) => s.id).filter((id) => byShow[id]);
      if (ids.length === 0) { if (!cancelled) setSimilarStatusMap({}); return; }

      const map = {};
      for (const id of ids) map[id] = byShow[id].status;
      if (!cancelled) setSimilarStatusMap({ ...map });

      const resolvableIds = ids.filter((id) => byShow[id].status !== "paused" && byShow[id].status !== "drop" && byShow[id].status !== "completed");
      if (resolvableIds.length === 0) return;

      const summary = await getShowWatchSummary(user.id, resolvableIds);
      const res = await fetch("/api/shows/library-detail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shows: resolvableIds.map((id) => ({ id, needsProgress: true, watched: summary[id]?.watchedKeys ?? [] })) }),
      });
      const { results } = await res.json();
      if (cancelled) return;
      const byId = Object.fromEntries(results.map((r) => [r.id, r]));
      const resolved = { ...map };
      for (const id of resolvableIds) {
        const result = byId[id];
        if (!result) continue;
        resolved[id] = resolveShowStatus({
          explicitStatus: byShow[id].status,
          watchedReleasedEpisodes: result.watchedReleasedEpisodes ?? 0,
          releasedEpisodes: result.releasedEpisodes ?? 0,
        });
      }
      setSimilarStatusMap(resolved);
    })().catch(console.error);
    return () => { cancelled = true; };
  }, [user, similar]);

  // "backdrop" | "poster" | "logo" | null — driven by a `?picker=` query
  // param (via router.push/back below) rather than local state, so the
  // device/browser back button closes just this screen instead of
  // leaving Show Detail entirely: Next's router owns a real history
  // entry for the URL this opens with, so back navigation composes with
  // it automatically instead of this component needing its own History
  // API handling (a bare useState + manual pushState/popstate listener
  // was tried first and fought with Next's own router history).
  const searchParams = useSearchParams();
  const imagePickerType = searchParams.get("picker");
  const customBackdropUrl = getCustomBackdrop(showId);
  const customPosterUrl = getCustomPoster(showId);
  const customLogoUrl = getCustomLogo(showId);

  // Auto title logo — when the user hasn't manually picked one (no
  // customLogoUrl), the hero title still defaults to the show's real TMDB
  // logo art instead of plain text, matched to the user's Readable
  // Languages the same way the Library shelf's spine/disc logos are (see
  // lib/tmdb.js's pickBestLogo) — a K-drama shows its Korean wordmark by
  // default when Korean is marked readable, not an English one. Falls back
  // to plain text if TMDB has no logo at all, or the image fails to load.
  const [autoLogoPath, setAutoLogoPath] = useState(null);
  const [autoLogoFailed, setAutoLogoFailed] = useState(false);
  useEffect(() => {
    setAutoLogoFailed(false);
    let cancelled = false;
    fetch("/api/shows/logos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [showId], readableLanguages }),
    })
      .then((res) => res.json())
      .then(({ results }) => { if (!cancelled) setAutoLogoPath(results?.[0]?.logoPath ?? null); })
      .catch(console.error);
    return () => { cancelled = true; };
  }, [showId, readableLanguages]);
  const autoLogoUrl = !autoLogoFailed && autoLogoPath ? tmdbImage(autoLogoPath, "w500") : null;

  // Colors the shared bottom nav (rendered by the (tabs) layout, several
  // levels up — see lib/nav-tint-context.jsx) with this show's own tint for
  // as long as this screen is mounted, reverting to the nav's default amber
  // the moment the user navigates away, whichever way they leave.
  const [, setNavTint] = useNavTint();
  useEffect(() => {
    setNavTint(tintColorForShow(showId));
    return () => setNavTint(null);
  }, [showId, setNavTint]);

  const favorite = isFavorite(showId);
  const [inLibrary, setInLibrary] = useState(false);
  // Was hardcoded to "watching" — for a show that's never been added to
  // the library (getUserShow's effect below returns early on `!row` and
  // never calls setStatus at all), that hardcoded default was never
  // replaced by anything, so resolveShowStatus's explicitStatus argument
  // was silently "watching" from the moment the page mounted. Tapping
  // "Add to Library" opens the StatusMenu against that stale default,
  // showing "Watching" pre-checked despite the user never having picked
  // anything — exactly the reported bug. null is the correct "nothing
  // chosen yet" value; resolveShowStatus already treats a null
  // explicitStatus as "no status" unless real watched-episode history
  // says otherwise (which is legitimate, not a bug).
  const [status, setStatus] = useState(null);
  // Whether `status` was ever actually picked (status menu, Watchlist-
  // confirm, Completed) vs. only existing because marking an episode/
  // season watched created the row — see setShowStatus's own comment.
  // Real hydration (the getUserShow effect below) always resolves this
  // from `row.statusExplicit ?? true` regardless of this initial value,
  // so defaulting to false here only affects the pre-load/never-added
  // state — which should read as "nothing explicit yet", matching the
  // `status: null` fix above, not as an already-real pick.
  const [statusExplicit, setStatusExplicit] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [desktopMoreOpen, setDesktopMoreOpen] = useState(false);
  // Fixed-position coords for the ••• menu (right of trigger by default,
  // with collision flip to left / down). Null until measured.
  const [desktopMorePos, setDesktopMorePos] = useState(null);
  const [collectionSheetOpen, setCollectionSheetOpen] = useState(false);
  // Desktop: centered liquid-glass modal (same pattern as image picker).
  // Mobile still uses the bottom sheet above.
  const [collectionAllOpen, setCollectionAllOpen] = useState(false);
  // Which video (trailer/teaser/featurette/etc.) is currently playing in
  // the fullscreen player below — was a plain trailerOpen boolean when
  // there was only ever one trailer to show; now there can be several
  // plus bonus content, so this holds the actual video object instead.
  const [openVideo, setOpenVideo] = useState(null);
  const [collections, setCollections] = useState([]);
  const [newCollectionOpen, setNewCollectionOpen] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [, setNavHidden] = useNavVisibility();

  // true/false — explicit "an episode/season mark or unmark action just
  // ran" trigger, set only inside setEpisodeWatchCount/markSeasonWatched/
  // markSeasonWithPreviousSeasons/unmarkSeasonWatched (never by
  // hydration/mount/navigation). The status-sync effect below consumes
  // *this*, not a passive watch on seasons/status in general — the latter
  // also fires the moment getEpisodeWatches hydrates on page load, which
  // would let merely opening a show with a pre-existing stored/actual
  // mismatch silently rewrite its status. A library write may only happen
  // as the direct result of a user clicking something.
  const [pendingStatusSync, setPendingStatusSync] = useState(false);
  // Once Remove is selected, no in-flight watch reconciliation may recreate
  // the library row while the cascade is being deleted.
  const suppressStatusSyncRef = useRef(false);
  // Blocks late episode watch/skip writes from landing after Remove wiped
  // history (Completed's bulk addEpisodeWatches and per-episode chains are
  // otherwise independent of libraryWriteChainRef).
  const suppressEpisodeWritesRef = useRef(false);
  // Invalidates in-flight getEpisodeWatches / getEpisodeSkips hydration so a
  // slow first-load response can't re-paint checkmarks after Not Watched /
  // Remove already cleared local state (and often the DB).
  const watchSeedGenRef = useRef(0);
  const skipSeedGenRef = useRef(0);
  // Bulk season / "previous episodes" adds — awaited on Remove so they can't
  // land after deleteAllEpisodeWatchesForShow.
  const showWatchWriteChainRef = useRef(Promise.resolve());
  // Per-"seasonId-episode" in-flight write promise — see
  // setEpisodeWatchCount below for why same-episode writes chain off this
  // instead of firing independently.
  const episodeWriteChainsRef = useRef({});
  // Same reasoning, for this show's own library row: the pendingStatusSync
  // effect below fires setShowStatus (create the implicit row) and
  // removeImplicitLibraryRow (delete it) independently per run, so a rapid
  // mark→unmark→mark sequence could race a "create" from an earlier run
  // against a "remove" from a later one and land in the wrong final state
  // — same failure mode as the episode-level race, just one level up.
  const libraryWriteChainRef = useRef(Promise.resolve());

  const [tab, setTab] = useState("episodes");
  const [seasons, setSeasons] = useState(initialSeasons);
  const [expandedSeason, setExpandedSeason] = useState(null);
  const [desktopSeasonId, setDesktopSeasonId] = useState(() => initialSeasons[0]?.id ?? null);
  const moreMenuRef = useRef(null);
  const moreMenuPanelRef = useRef(null);
  const moreMenuBtnRef = useRef(null);

  const [ratingEpisode, setRatingEpisode] = useState(null); // { seasonId, ep }
  const [activeEpisode, setActiveEpisode] = useState(null); // { seasonId, epNumber }
  const [watchMenuFor, setWatchMenuFor] = useState(null); // "seasonId-n" key, or "detail"
  const [skipMenuFor, setSkipMenuFor] = useState(null); // shown when marking an episode watched out of order
  // Watch Next row's own copy of the watchMenuFor/skipMenuFor popups —
  // rendered via position:fixed off this captured button rect instead of
  // position:absolute nested inside the row (see the render site below for
  // why: the row needs overflow-x-auto for horizontal scroll, which per
  // the CSS spec forces its overflow-y to auto too, and each card also
  // needs its own overflow-hidden to clip the poster's rounded corners —
  // between the two, an absolutely-positioned dropdown opening below a
  // button near a 130px-tall card's bottom edge was being clipped into
  // invisibility. Regular Safari tolerated it (a known compositing
  // leniency), but a PWA's stricter WKWebView correctly clips it, which is
  // why it only ever showed up as "doesn't work in the installed app".
  const [watchNextMenuAnchor, setWatchNextMenuAnchor] = useState(null); // { rect, seasonId, epNumber, watchCount } | null
  const [skipSeasonMenuFor, setSkipSeasonMenuFor] = useState(null); // seasonId, shown when marking a season watched out of order

  // The shared bottom nav (components/ui/FloatingNav.jsx) floats at
  // zIndex 100 — above every one of this screen's own overlays below
  // (the full-screen ones at z-50, and these "Mark As…"/"Set Watch
  // Status" dropdowns at z-30) — so without this it stayed visible AND
  // clickable on top of all of them. Most obviously wrong for the
  // Collections sheet, but the dropdowns are just as real a problem:
  // whenever one opens low enough on the screen (any season/episode
  // further down the list — routine on a real phone viewport, not an
  // edge case), the nav sits on top and silently eats taps meant for
  // whichever menu item falls in its footprint — confirmed directly, a
  // tap on "Skipped" landing in that zone did nothing at all. Hidden for
  // as long as any of these are open, same pattern
  // components/library/CaseOverlay.jsx already uses for its own overlay.
  useEffect(() => {
    const hidden = collectionSheetOpen || collectionAllOpen || newCollectionOpen || !!openVideo
      || watchMenuFor != null || skipMenuFor != null || skipSeasonMenuFor != null || watchNextMenuAnchor != null;
    setNavHidden(hidden);
    return () => setNavHidden(false);
  }, [collectionSheetOpen, collectionAllOpen, newCollectionOpen, openVideo, watchMenuFor, skipMenuFor, skipSeasonMenuFor, watchNextMenuAnchor, setNavHidden]);

  // Season ratings (0-10, mood/character/review — reference/
  // season_rating_prototype.jsx), keyed by season number:
  // { [seasonNumber]: { rating, mood, characterId, characterName, text, shareId, savedAt } }.
  const [seasonRatings, setSeasonRatings] = useState({});
  // Tracks whether the getSeasonRatings fetch below has actually resolved
  // at least once — the deep-link effect further down must wait for this
  // before opening SeasonRatingScreen, or it mounts with manual still
  // undefined (see that effect's own comment for the bug this prevents).
  const [seasonRatingsLoaded, setSeasonRatingsLoaded] = useState(false);
  const [reviewOpenFor, setReviewOpenFor] = useState(null); // season id/number, or null
  const [reviewInitialEditing, setReviewInitialEditing] = useState(false);
  const [shareCardFor, setShareCardFor] = useState(null); // season id/number, or null
  const [username, setUsername] = useState("you");

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    // seasonRatingsLoaded flips to true on failure too (not just success) —
    // the deep-link effect above gates on it before ever opening
    // SeasonRatingScreen, so a fetch error must still resolve that wait
    // rather than leaving reviewOpenFor permanently stuck pending.
    getSeasonRatings(user.id, showId)
      .then((data) => { if (!cancelled) setSeasonRatings(data); })
      .catch(console.error)
      .finally(() => { if (!cancelled) setSeasonRatingsLoaded(true); });
    getProfile(user.id).then((p) => { if (!cancelled) setUsername(p?.handle || p?.displayName || "you"); }).catch(console.error);
    return () => { cancelled = true; };
  }, [user, showId]);

  const saveSeasonRatingFor = async (seasonNumber, payload) => {
    await saveSeasonRating(user.id, showId, seasonNumber, payload);
    setSeasonRatings((sr) => ({ ...sr, [seasonNumber]: { ...payload, shareId: sr[seasonNumber]?.shareId ?? null, savedAt: new Date() } }));
  };

  const deleteSeasonRatingFor = async (seasonNumber) => {
    await deleteSeasonRating(user.id, showId, seasonNumber);
    setSeasonRatings((sr) => { const next = { ...sr }; delete next[seasonNumber]; return next; });
  };

  const openReviewSeason = (seasonNumber) => {
    const manual = seasonRatings[seasonNumber];
    setReviewOpenFor(seasonNumber);
    setReviewInitialEditing(!manual);
  };

  // Profile's My Ratings row's edit-pencil shortcut (ShareRatingCard's
  // onEdit) deep-links here as /show/[id]?tab=reviews&reviewSeason=N,
  // landing straight in that season's editor instead of just the show's
  // default Episodes tab. reviewOpenedFromProfile tracks that this
  // specific open came from that deep link (not from just browsing this
  // show's own Reviews tab normally) — closing the editor should return
  // to Profile in that case instead of revealing this show's own page
  // underneath, since the user never actually meant to land here.
  const [reviewOpenedFromProfile, setReviewOpenedFromProfile] = useState(false);
  // True from the very first render whenever this page was reached via the
  // ?tab=reviews deep link (a lazy useState initializer, so it's already
  // true before anything else even paints — no one-frame gap where it
  // could still read false). Drives a full-screen cover (rendered further
  // down) that hides this page's own hero/episodes content for as long as
  // this is true, so a deep-linked visitor never sees a flash of the plain
  // Show Detail page before SeasonRatingScreen appears — they used to,
  // since seasonRatingsLoaded (below) genuinely has to finish an async
  // fetch first, and this page was fully visible underneath the whole
  // time that took.
  const [deepLinkPending, setDeepLinkPending] = useState(() => searchParams.get("tab") === "reviews");
  // Waits for seasonRatingsLoaded before actually opening SeasonRatingScreen
  // — the bug seasonRatingsLoaded's own comment above warns about: this
  // effect previously fired as soon as `seasons` was available (synchronous,
  // from initialSeasons), which is BEFORE the real per-user seasonRatings
  // fetch resolves. SeasonRatingScreen mounted with `manual` still
  // undefined for a season that actually had a saved rating (e.g. Profile's
  // edit-pencil for an already-rated season), and never picked up the real
  // rating/review once it did arrive a moment later — reading as "my rating
  // wasn't saved" when it actually was. deepLinkConsumedRef ensures this
  // only actually opens the editor once, even though the effect itself
  // re-runs harmlessly (just re-setting the same tab) while it waits.
  const deepLinkConsumedRef = useRef(false);
  useEffect(() => {
    if (deepLinkConsumedRef.current) return;
    if (searchParams.get("tab") !== "reviews") return;
    setTab("reviews");
    if (!seasonRatingsLoaded) return;
    const seasonParam = Number(searchParams.get("reviewSeason"));
    if (seasons.some((s) => s.id === seasonParam)) {
      setReviewOpenFor(seasonParam);
      // Same rule as tapping a season normally (openReviewSeason above):
      // land in the read-only "saved" view (3-dot/share header, no forced
      // form) when a rating already exists, editing only for an unrated
      // season — UNLESS the caller explicitly asked for edit mode via
      // &edit=1 (ShareRatingCard's own "Edit" pencil button, which really
      // does mean "start editing now" regardless of state).
      const forceEdit = searchParams.get("edit") === "1";
      setReviewInitialEditing(forceEdit || !seasonRatings[seasonParam]);
      setReviewOpenedFromProfile(true);
    }
    deepLinkConsumedRef.current = true;
    // The cover's job ends here regardless of whether a valid season was
    // actually found above — SeasonRatingScreen (once reviewOpenFor is
    // set) is its own solid-background fixed overlay that takes over
    // seamlessly, and if no valid season was found there's nothing left
    // to hide behind a cover for.
    setDeepLinkPending(false);
  }, [searchParams, seasonRatingsLoaded, seasons, seasonRatings]);

  // Single source of truth for "what status is this show actually in" —
  // see lib/statusResolver.js. Computed fresh on every render straight
  // from local seasons state, never trusted from the stored `status` alone,
  // so the status pill/StatusMenu can never show something that
  // contradicts the season progress rendered right below them.
  //
  // Season 0 (Specials) is excluded from every sum here — Specials are
  // independently trackable (their own season card still shows/marks
  // watched/skipped normally) but never required for, or counted toward,
  // the show's own completion. resolvedReleasedEpisodes additionally
  // counts Skipped episodes as done without counting them as watched —
  // watchedReleasedEpisodes stays real-watches-only, for anything that
  // needs an actual watch count/stat rather than a completion signal.
  const isRegularSeason = (s) => s.id !== 0;
  const releasedEpisodes = seasons.filter(isRegularSeason).reduce((sum, s) => sum + s.episodes.filter((e) => e.daysUntil == null).length, 0);
  const watchedReleasedEpisodes = seasons.filter(isRegularSeason).reduce((sum, s) => sum + s.episodes.filter((e) => e.daysUntil == null && e.watched).length, 0);
  const resolvedReleasedEpisodes = seasons.filter(isRegularSeason).reduce((sum, s) => sum + s.episodes.filter((e) => e.daysUntil == null && (e.watched || e.skipped)).length, 0);
  const resolvedStatus = resolveShowStatus({ explicitStatus: status, watchedReleasedEpisodes, releasedEpisodes, resolvedReleasedEpisodes });

  // initialSeasons is TMDB-only (no per-user data in it) — seed real
  // watched/watchCount/rating state from Supabase once the signed-in user
  // is known. Purely a read: it seeds local state from what's already in
  // Supabase, it never writes anything back.
  useEffect(() => {
    if (!user) return;
    const gen = ++watchSeedGenRef.current;
    let cancelled = false;
    getEpisodeWatches(user.id, showId).then((byEpisode) => {
      if (cancelled || gen !== watchSeedGenRef.current || suppressEpisodeWritesRef.current) return;
      setSeasons((ss) => ss.map((s) => ({
        ...s,
        episodes: s.episodes.map((e) => {
          const hit = byEpisode[`${s.id}-${e.n}`];
          if (!hit) return e;
          return { ...e, watched: true, watchCount: hit.watchCount, myRating: hit.rating != null ? hit.rating : e.myRating };
        }),
      })));
    }).catch(console.error);
    return () => { cancelled = true; };
  }, [user, showId]);

  // Same seed pattern as the watches effect above, one table over —
  // episode_skips is a plain toggle (no count/rating), so this just flips
  // `skipped: true` on a match. Watched and Skipped are mutually
  // exclusive per episode; a row can only exist in one of the two tables
  // at a time (every write path that sets one clears the other — see
  // markSkipped/markNotWatched/toggleEp below), so there's no ordering
  // dependency between this effect and the watches one above.
  useEffect(() => {
    if (!user) return;
    const gen = ++skipSeedGenRef.current;
    let cancelled = false;
    getEpisodeSkips(user.id, showId).then((skippedKeys) => {
      if (cancelled || gen !== skipSeedGenRef.current || suppressEpisodeWritesRef.current) return;
      setSeasons((ss) => ss.map((s) => ({
        ...s,
        episodes: s.episodes.map((e) => (skippedKeys.has(`${s.id}-${e.n}`) ? { ...e, skipped: true } : e)),
      })));
    }).catch(console.error);
    return () => { cancelled = true; };
  }, [user, showId]);

  // Library status (Watchlist/Watching/.../Remove) + favorite — user_shows.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getUserShow(user.id, showId).then((row) => {
      if (cancelled || !row) return;
      setInLibrary(true);
      setStatus(row.status);
      setStatusExplicit(row.statusExplicit ?? true);
    }).catch(console.error);
    return () => { cancelled = true; };
  }, [user, showId]);

  // Keeps the *stored* status in sync with actual watch state, not just
  // what's displayed (the pill/StatusMenu already always render
  // resolvedStatus, live, regardless of this effect's timing) — the row
  // must never be left saying "watchlist" while every episode is watched,
  // even as a stored value nobody's currently looking at. This is the one
  // place status auto-transitions from watch activity: first watched
  // episode moves watchlist -> watching, watching every released episode
  // moves it to completed, unmarking one from completed moves it back to
  // watching. resolveShowStatus's own first branch already preserves
  // paused/drop regardless of progress, so there's no separate guard
  // needed for those here.
  //
  // NOT gated on inLibrary (a prior version was, on the theory that this
  // should only ever adjust a status that's already explicitly there) —
  // but "explicitly marking an episode/season watched" is itself one of
  // this app's own six sanctioned actions allowed to create a user_shows
  // row, same as picking Watchlist/Watching/etc. from the status menu
  // (see the standing rule this whole engagement has followed). Gating on
  // inLibrary meant marking a season watched on a show you hadn't
  // explicitly added yet left it with no library row and no status at
  // all — its episodes were genuinely marked watched (that write never
  // checked inLibrary), but the status pill still just said "Add to
  // Library" since nothing ever created the row. setShowStatus is already
  // an upsert, so this one call creates the row the first time and
  // updates it every time after, no separate insert path needed. This is
  // still gated on pendingStatusSync itself only ever being set inside an
  // explicit action handler (never by the read-only hydration effects
  // above), so a page load still can't trigger this on its own.
  //
  // Three cases, in order:
  // 1. An implicit row (statusExplicit false) whose last watched episode
  //    was just unmarked — resolveShowStatus's own "preserve explicitStatus
  //    at zero watched" branch means resolvedStatus would just equal the
  //    stale status forever here, which is exactly the bug this used to
  //    have (the status pill stuck on "watched" after undoing). Nothing
  //    justifies this row anymore, so revert it out of the library
  //    entirely instead of leaving a phantom status behind. Never applies
  //    when statusExplicit is true — an explicit pick must survive
  //    unmarking down to zero regardless, per that same preserve rule.
  // 2. Not in the library yet — create it. This is the only case allowed
  //    to write statusExplicit: false, since it's the only case where
  //    marking an episode is the *sole* reason the row exists at all.
  // 3. Already in the library, statusExplicit is TRUE — do nothing.
  //    Persisting the live-resolved status here used to overwrite the
  //    user's real explicit pick: e.g. explicitly on "Watchlist", then
  //    marking a season watched auto-progressed the *stored* status to
  //    "watching" (this branch used to write that back to `status`,
  //    which resolveShowStatus's own explicitStatus parameter reads on
  //    the next resolve) — so once every episode got unmarked again,
  //    resolveShowStatus had nothing left to fall back to except that
  //    now-"watching" stored value, and the pill stayed stuck on
  //    "Watching" instead of reverting to "Watchlist". Every surface that
  //    displays a status already re-resolves live from watched counts on
  //    every render (see lib/statusResolver.js's own doc comment) — there
  //    was never a real need to persist the transient "watching"/
  //    "completed" value for an explicit row in the first place, and doing
  //    so is exactly what made the original explicit choice unrecoverable.
  //    Leaving `status` untouched here means it always holds the user's
  //    last deliberate pick, and resolvedStatus keeps computing "watching"/
  //    "completed" live for as long as that's actually true, then correctly
  //    falls back to the real explicit pick the moment watched count
  //    returns to 0 — no separate write, no separate revert logic needed.
  // 4. Already in the library, statusExplicit is FALSE — plain
  //    progress-driven persistence (this is the row's only justification
  //    for existing at all, so keeping its stored status current is safe
  //    and, unlike case 3, has no "original explicit choice" to clobber).
  useEffect(() => {
    if (!pendingStatusSync || suppressStatusSyncRef.current) return;
    setPendingStatusSync(false);
    if (!user) return;

    if (inLibrary && !statusExplicit && resolvedReleasedEpisodes === 0) {
      setInLibrary(false);
      setStatus("watching");
      setStatusExplicit(true);
      libraryWriteChainRef.current = libraryWriteChainRef.current
        .catch(() => {})
        .then(() => removeImplicitLibraryRow(user.id, showId, "ShowDetailClient:episodeUnmarkedToZero"))
        .catch(console.error);
      return;
    }

    if (!inLibrary) {
      if (resolvedStatus) {
        setStatus(resolvedStatus);
        setInLibrary(true);
        setStatusExplicit(false);
        libraryWriteChainRef.current = libraryWriteChainRef.current
          .catch(() => {})
          .then(() => setShowStatus(user.id, showId, resolvedStatus, "ShowDetailClient:episodeMarked", { explicit: false }))
          .catch(console.error);
      }
      return;
    }

    if (statusExplicit) return;

    if (resolvedStatus && resolvedStatus !== status) {
      setStatus(resolvedStatus);
      libraryWriteChainRef.current = libraryWriteChainRef.current
        .catch(() => {})
        .then(() => setShowStatus(user.id, showId, resolvedStatus, "ShowDetailClient:episodeMarked"))
        .catch(console.error);
    }
  }, [pendingStatusSync, resolvedStatus, status, user, showId, inLibrary, statusExplicit, resolvedReleasedEpisodes]);

  // Collections sheet — which of the user's collections this show is
  // already in, so the "Add to a Collection" sheet reflects real state
  // instead of always starting empty.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getCollections(user.id).then(async (rows) => {
      if (cancelled) return;
      const mapped = rows.map((c) => ({
        id: c.id,
        name: c.name,
        count: c.showIds.length + (c.movieIds?.length ?? 0),
        inShow: c.showIds.includes(showId),
        showIds: c.showIds,
        movieIds: c.movieIds ?? [],
        covers: [],
      }));
      setCollections(mapped);
      const hydrated = await hydrateCollectionPreviews(mapped, 9);
      if (cancelled) return;
      const coversById = new Map(hydrated.map((c) => [c.id, c.covers]));
      setCollections((prev) => prev.map((c) => ({ ...c, covers: coversById.get(c.id) ?? c.covers })));
    }).catch(console.error);
    return () => { cancelled = true; };
  }, [user, showId]);

  // Every single-episode watch mutation (toggle, rewatch, mark
  // unwatched/watched-once) funnels through here — one choke point to (a)
  // require sign-in before writing and (b) mirror the change to Supabase.
  // Returns false (and redirects to /login) if there's no signed-in user.
  const setEpisodeWatchCount = (seasonId, n, count) => {
    if (!user) { router.push("/login"); return false; }
    if (suppressEpisodeWritesRef.current) return false;
    // Drop any in-flight seed that still has the old watch rows — otherwise
    // Not Watched can clear the checkmark and then hydration paints it back.
    watchSeedGenRef.current += 1;
    const prevSeason = seasons.find((s) => s.id === seasonId);
    const prevEp = prevSeason?.episodes.find((e) => e.n === n);
    const prevCount = prevEp?.watchCount || 0;
    // Watched and Skipped are mutually exclusive — marking any real watch
    // count (including back to Not Watched, count 0, which still means
    // "not skipped either") clears a prior skip both locally and in
    // Supabase. Fire-and-forget, same as every other write here — a
    // failure just leaves the skip row in place, which self-heals next
    // time this episode's watch state changes again.
    if (prevEp?.skipped) persistEpisodeSkipped(user.id, showId, seasonId, n, false).catch(console.error);
    setSeasons((ss) => ss.map((s) => s.id !== seasonId ? s : { ...s, episodes: s.episodes.map((e) => e.n === n ? { ...e, watchCount: count, watched: count > 0, skipped: false } : e) }));

    // Same-episode writes are chained, not fired independently — rapid
    // mark/unmark/mark taps on the same episode (exactly what testing a
    // toggle looks like) otherwise race: two overlapping
    // syncEpisodeWatchCount calls (each its own clear-then-add) can
    // resolve out of order, so a later "unmark" finishes in the DB
    // *before* an earlier still-in-flight "mark" — leaving a watched row
    // behind even though the UI (and the user's actual last action) say
    // unwatched. Chaining off the same episode's prior promise forces the
    // writes to land in call order instead of network-response order.
    const key = `${seasonId}-${n}`;
    const chain = (episodeWriteChainsRef.current[key] ?? Promise.resolve())
      .catch(() => {}) // a prior failure must not block this write from attempting
      .then(() => syncEpisodeWatchCount(user.id, showId, seasonId, n, count));
    episodeWriteChainsRef.current[key] = chain;
    chain.catch((err) => {
      console.error(err);
      // Only roll back if this is still the latest queued write for this
      // episode — a newer toggle already superseded it, so reverting now
      // would stomp intent the user expressed after this one.
      if (episodeWriteChainsRef.current[key] !== chain) return;
      setSeasons((ss) => ss.map((s) => s.id !== seasonId ? s : { ...s, episodes: s.episodes.map((e) => e.n === n ? { ...e, watchCount: prevCount, watched: prevCount > 0, skipped: prevEp?.skipped ?? false } : e) }));
    });

    setPendingStatusSync(true);
    return true;
  };

  // Skip's own write chain, same reasoning as setEpisodeWatchCount above
  // (rapid taps on the same episode must land in call order, not network-
  // response order) — a separate, simpler chain map since skip writes
  // never race watch writes for the SAME episode (setEpisodeWatchCount
  // already clears skipped locally+remotely before this could ever fire
  // concurrently with it, and vice versa: this clears any watch first).
  const setEpisodeSkippedState = (seasonId, n, skipped) => {
    if (!user) { router.push("/login"); return false; }
    if (suppressEpisodeWritesRef.current) return false;
    skipSeedGenRef.current += 1;
    watchSeedGenRef.current += 1;
    const prevSeason = seasons.find((s) => s.id === seasonId);
    const prevEp = prevSeason?.episodes.find((e) => e.n === n);
    const prevWatched = !!prevEp?.watched;
    const prevWatchCount = prevEp?.watchCount || 0;
    setSeasons((ss) => ss.map((s) => s.id !== seasonId ? s : { ...s, episodes: s.episodes.map((e) => e.n === n ? { ...e, skipped, watched: skipped ? false : e.watched, watchCount: skipped ? 0 : e.watchCount } : e) }));

    const key = `${seasonId}-${n}`;
    const chain = (episodeWriteChainsRef.current[key] ?? Promise.resolve())
      .catch(() => {})
      .then(async () => {
        // Marking Skipped clears any real watch rows first — the two are
        // mutually exclusive per episode, same as the reverse direction
        // in setEpisodeWatchCount above.
        if (skipped && prevWatchCount > 0) await clearEpisodeWatches(user.id, showId, seasonId, n);
        await persistEpisodeSkipped(user.id, showId, seasonId, n, skipped);
      });
    episodeWriteChainsRef.current[key] = chain;
    chain.catch((err) => {
      console.error(err);
      if (episodeWriteChainsRef.current[key] !== chain) return;
      setSeasons((ss) => ss.map((s) => s.id !== seasonId ? s : { ...s, episodes: s.episodes.map((e) => e.n === n ? { ...e, skipped: prevEp?.skipped ?? false, watched: prevWatched, watchCount: prevWatchCount } : e) }));
    });

    setPendingStatusSync(true);
    return true;
  };
  const markSkipped = (seasonId, n) => { setEpisodeSkippedState(seasonId, n, true); setWatchMenuFor(null); setSkipMenuFor(null); setWatchNextMenuAnchor(null); };

  const toggleEp = (seasonId, n) => {
    const season = seasons.find((s) => s.id === seasonId);
    const ep = season?.episodes.find((e) => e.n === n);
    if (!ep) return;
    // First mark: activate watched immediately and open the rating card.
    // Menus (Mark As… / skip-ahead) only appear on a later click once watched.
    setWatchMenuFor(null);
    setSkipMenuFor(null);
    setWatchNextMenuAnchor(null);
    if ((ep.watchCount || 0) === 0 && !ep.watched) {
      if (!setEpisodeWatchCount(seasonId, n, 1)) return;
      setRatingEpisode({ seasonId, ep: { ...ep, watched: true, watchCount: 1 } });
      return;
    }
    // Already watched but rating sheet requested again (e.g. Watched Once)
    if (ep.watched || (ep.watchCount || 0) > 0) {
      setRatingEpisode({ seasonId, ep: { ...ep, watched: true, watchCount: Math.max(ep.watchCount || 0, 1) } });
    }
  };

  // Explicit first-mark path used by desktop/mobile check buttons — never opens a menu.
  const markWatchedAndRate = (seasonId, ep) => {
    if (!ep || ep.daysUntil != null) return;
    setWatchMenuFor(null);
    setSkipMenuFor(null);
    setWatchNextMenuAnchor(null);
    if (ep.watched || (ep.watchCount || 0) > 0) {
      setRatingEpisode({ seasonId, ep: { ...ep, watched: true, watchCount: Math.max(ep.watchCount || 0, 1) } });
      return;
    }
    if (!setEpisodeWatchCount(seasonId, ep.n, 1)) return;
    setRatingEpisode({ seasonId, ep: { ...ep, watched: true, watchCount: 1 } });
  };

  // Rating (stars) persists onto the episode's most recent watch row. The
  // schema has no mood/text columns on episode_watches yet (those exist
  // only on season_reviews), so those still only live locally here.
  const saveEpisodeRating = ({ stars }) => {
    if (!ratingEpisode) return;
    setSeasons((ss) => ss.map((s) => s.id !== ratingEpisode.seasonId ? s : { ...s, episodes: s.episodes.map((e) => e.n === ratingEpisode.ep.n ? { ...e, myRating: stars || e.myRating } : e) }));
    if (user && stars) {
      rateLatestWatch(user.id, showId, ratingEpisode.seasonId, ratingEpisode.ep.n, stars).catch(console.error);
    }
  };

  // s.id !== 0 excludes Specials from ever being swept in as "an earlier
  // season" — Specials sorts as season_number 0, which numerically is
  // "before" every real season, but it isn't actually earlier in the
  // show's own chronology and must never gate/be gated by regular-season
  // completion. !e.skipped: a skipped episode is resolved, not an
  // "unwatched" gap the user needs a warning about.
  const hasEarlierSeasonUnwatched = (seasonId) => seasons.some((s) => s.id !== 0 && s.id < seasonId && s.episodes.some((e) => e.daysUntil == null && !e.watched && !e.skipped));

  const enqueueShowWatchWrite = (fn) => {
    const next = showWatchWriteChainRef.current.catch(() => {}).then(async () => {
      if (suppressEpisodeWritesRef.current) return;
      await fn();
    });
    showWatchWriteChainRef.current = next;
    return next;
  };

  const markSeasonWatched = (seasonId) => {
    if (!user) { router.push("/login"); return; }
    if (suppressEpisodeWritesRef.current) return;
    watchSeedGenRef.current += 1;
    const season = seasons.find((s) => s.id === seasonId);
    // !e.skipped — an already-Skipped episode is already resolved; bulk-
    // marking the season watched must not silently overwrite a
    // deliberate skip with a forced watch.
    const newlyWatched = season.episodes.filter((e) => e.daysUntil == null && (e.watchCount || 0) === 0 && !e.skipped).map((e) => ({ seasonNumber: seasonId, episodeNumber: e.n }));
    setSeasons((ss) => ss.map((s) => s.id !== seasonId ? s : { ...s, episodes: s.episodes.map((e) => e.daysUntil != null || e.skipped ? e : { ...e, watched: true, watchCount: Math.max(e.watchCount || 0, 1) }) }));
    setSkipSeasonMenuFor(null);
    enqueueShowWatchWrite(() => addEpisodeWatches(user.id, showId, newlyWatched)).catch(console.error);
    setPendingStatusSync(true);
  };

  const markSeasonWithPreviousSeasons = (seasonId) => {
    if (!user) { router.push("/login"); return; }
    if (suppressEpisodeWritesRef.current) return;
    watchSeedGenRef.current += 1;
    // s.id !== 0 — same reasoning as hasEarlierSeasonUnwatched above:
    // Specials must never get swept in just because 0 <= seasonId is
    // numerically true for every real season.
    const newlyWatched = seasons.filter((s) => s.id !== 0 && s.id <= seasonId).flatMap((s) =>
      s.episodes.filter((e) => e.daysUntil == null && (e.watchCount || 0) === 0 && !e.skipped).map((e) => ({ seasonNumber: s.id, episodeNumber: e.n }))
    );
    setSeasons((ss) => ss.map((s) => s.id !== 0 && s.id <= seasonId ? { ...s, episodes: s.episodes.map((e) => e.daysUntil != null || e.skipped ? e : { ...e, watched: true, watchCount: Math.max(e.watchCount || 0, 1) }) } : s));
    setSkipSeasonMenuFor(null);
    enqueueShowWatchWrite(() => addEpisodeWatches(user.id, showId, newlyWatched)).catch(console.error);
    setPendingStatusSync(true);
  };

  const unmarkSeasonWatched = (seasonId) => {
    if (!user) { router.push("/login"); return; }
    if (suppressEpisodeWritesRef.current) return;
    watchSeedGenRef.current += 1;
    skipSeedGenRef.current += 1;
    const season = seasons.find((s) => s.id === seasonId);
    // A full reset of this season's resolution state — clears Skipped
    // too, not just real watches, so "unmark season" genuinely undoes
    // everything the season-level ring/allWatched check considers
    // resolved (see the season-card render below).
    const toClear = season.episodes.filter((e) => e.daysUntil == null && (e.watchCount || 0) > 0).map((e) => e.n);
    const toUnskip = season.episodes.filter((e) => e.daysUntil == null && e.skipped).map((e) => e.n);
    setSeasons((ss) => ss.map((s) => s.id !== seasonId ? s : { ...s, episodes: s.episodes.map((e) => e.daysUntil != null ? e : { ...e, watched: false, watchCount: 0, skipped: false }) }));
    enqueueShowWatchWrite(async () => {
      await Promise.all(toClear.map((n) => clearEpisodeWatches(user.id, showId, seasonId, n)));
      await Promise.all(toUnskip.map((n) => persistEpisodeSkipped(user.id, showId, seasonId, n, false)));
    }).catch(console.error);
    setPendingStatusSync(true);
  };

  // Only ever fired by picking "Completed" from the top-level status menu
  // (selectStatus) — the one truly *automatic* whole-show completion
  // action, as opposed to markSeasonWatched/markSeasonWithPreviousSeasons
  // above (explicit, scoped, user-picked-this-season actions). Excludes
  // Specials (s.id !== 0) entirely and leaves already-Skipped episodes
  // alone, same reasoning as markSeasonWatched: Specials must never be
  // automatically marked watched, and a deliberate skip is already
  // resolved, not something to silently overwrite.
  const markAllSeasonsWatched = () => {
    if (!user) { router.push("/login"); return Promise.resolve(); }
    if (suppressEpisodeWritesRef.current) return Promise.resolve();
    watchSeedGenRef.current += 1;
    const newlyWatched = seasons.filter((s) => s.id !== 0).flatMap((s) =>
      s.episodes.filter((e) => e.daysUntil == null && (e.watchCount || 0) === 0 && !e.skipped).map((e) => ({ seasonNumber: s.id, episodeNumber: e.n }))
    );
    setSeasons((ss) => ss.map((s) => s.id === 0 ? s : {
      ...s,
      episodes: s.episodes.map((e) => e.daysUntil != null || e.skipped ? e : { ...e, watched: true, watchCount: Math.max(e.watchCount || 0, 1) }),
    }));
    return enqueueShowWatchWrite(() => addEpisodeWatches(user.id, showId, newlyWatched));
  };

  const selectStatus = (id) => {
    if (!user) { router.push("/login"); return; }
    if (id === "remove") {
      // Remove returns the show to its pre-library state ("Add to List"):
      // delete the library row and clear local status UI. removeUserShow
      // also clears watches/reviews so progress UI can't outlive the row.
      setStatusOpen(false);
      // A queued watch reconciliation must not recreate this row after
      // Remove has been selected.
      suppressStatusSyncRef.current = true;
      suppressEpisodeWritesRef.current = true;
      watchSeedGenRef.current += 1;
      skipSeedGenRef.current += 1;
      setPendingStatusSync(false);
      libraryWriteChainRef.current = libraryWriteChainRef.current
        .catch(() => {})
        .then(async () => {
          // Drain in-flight per-episode + bulk season writes so they can't
          // re-insert rows after deleteAllEpisodeWatchesForShow.
          const pending = Object.values(episodeWriteChainsRef.current);
          episodeWriteChainsRef.current = {};
          await Promise.all(pending.map((p) => Promise.resolve(p).catch(() => {})));
          await showWatchWriteChainRef.current.catch(() => {});
          await removeUserShow(user.id, showId, "ShowDetailClient:selectStatus:remove");
      setInLibrary(false);
      setFavorite(false);
      setStatus(null);
      setStatusExplicit(false);
      setSeasons((ss) => ss.map((s) => ({
        ...s,
        episodes: s.episodes.map((e) => ({ ...e, watched: false, watchCount: 0, skipped: false, myRating: null })),
      })));
      setWatchedShowIds((prev) => { const next = new Set(prev); next.delete(showId); return next; });
          setSeasonRatings({});
        })
        .catch((err) => {
          console.error(err);
          suppressStatusSyncRef.current = false;
          suppressEpisodeWritesRef.current = false;
          window.alert("Couldn't remove this show — please try again.");
        });
      return;
    }
    if (id === "watchlist" && (watchedReleasedEpisodes > 0 || resolvedReleasedEpisodes > 0)) {
      // Watchlist is definitionally zero watched (or skipped) episodes
      // (see lib/statusResolver.js) — landing here with progress already
      // recorded would recreate the exact contradiction this file's
      // status logic exists to prevent. Confirm before clearing rather
      // than either silently keeping the stale "10/10 watched" progress
      // under a Watchlist label, or silently discarding it unasked.
      const confirmed = window.confirm(
        `${displayTitle} has watched episodes. Moving it to Watchlist will clear its watch history — this can't be undone. Continue?`
      );
      if (!confirmed) { setStatusOpen(false); return; }
      suppressStatusSyncRef.current = false;
      suppressEpisodeWritesRef.current = false;
      setPendingStatusSync(false);
      setStatus("watchlist");
      setStatusExplicit(true);
      setInLibrary(true);
      setSeasons((ss) => ss.map((s) => ({
        ...s,
        episodes: s.episodes.map((e) => ({ ...e, watched: false, watchCount: 0, skipped: false, myRating: null })),
      })));
      libraryWriteChainRef.current = libraryWriteChainRef.current
        .catch(() => {})
        .then(() => setWatchlistAndClearProgress(user.id, showId, "ShowDetailClient:selectStatus:watchlist-confirm"))
        .catch(console.error);
      setStatusOpen(false);
      return;
    }
    suppressStatusSyncRef.current = false;
    suppressEpisodeWritesRef.current = false;
    setStatus(id);
    setPendingStatusSync(false);
    setStatusExplicit(true);
    setInLibrary(true);
    // Canonical "Completed" behavior: status + every currently-aired
    // episode marked watched, on the same write chain as status so a
    // quick follow-up Remove can't race past in-flight bulk watches.
    const completedWatches = id === "completed" ? markAllSeasonsWatched() : Promise.resolve();
    libraryWriteChainRef.current = libraryWriteChainRef.current
      .catch(() => {})
      .then(() => setShowStatus(user.id, showId, id, "ShowDetailClient:selectStatus", { explicit: true }))
      .then(() => completedWatches)
      .catch(console.error);
    setStatusOpen(false);
  };

  const addToLibrary = () => {
    if (!user) { router.push("/login"); return; }
    // First click commits Watchlist immediately — do not open the picker
    // or leave the pill on a blank "Choose Status" state. A later click
    // on the same pill (now showing Watchlist / Watching / …) opens the
    // status menu to change it.
    setDesktopMoreOpen(false);
    setStatusOpen(false);
    suppressStatusSyncRef.current = false;
    suppressEpisodeWritesRef.current = false;
    setPendingStatusSync(false);
    setStatus("watchlist");
    setStatusExplicit(true);
    setInLibrary(true);
    libraryWriteChainRef.current = libraryWriteChainRef.current
      .catch(() => {})
      .then(() => setShowStatus(user.id, showId, "watchlist", "ShowDetailClient:addToLibrary", { explicit: true }))
      .catch(console.error);
  };

  const markWatchedFromDetail = () => {
    const { seasonId, epNumber } = activeEpisode;
    setActiveEpisode(null);
    toggleEp(seasonId, epNumber);
  };

  const markNotWatched = (seasonId, n) => { setEpisodeWatchCount(seasonId, n, 0); setWatchMenuFor(null); setWatchNextMenuAnchor(null); };
  const markWatchedOnce = (seasonId, n) => {
    if (!setEpisodeWatchCount(seasonId, n, 1)) { setWatchMenuFor(null); setWatchNextMenuAnchor(null); return; }
    setWatchMenuFor(null);
    setWatchNextMenuAnchor(null);
    const season = seasons.find((s) => s.id === seasonId);
    const ep = season.episodes.find((e) => e.n === n);
    setRatingEpisode({ seasonId, ep: { ...ep, watched: true, watchCount: 1 } });
  };
  const markRewatched = (seasonId, n, currentCount) => { setEpisodeWatchCount(seasonId, n, (currentCount || 1) + 1); setWatchMenuFor(null); setWatchNextMenuAnchor(null); };

  // true if any earlier, already-aired episode (this season before n, or an
  // earlier season) is still unresolved (neither watched nor skipped).
  // Specials naturally never trip this: `seasons`' own array order already
  // places it last (see app/(tabs)/show/[id]/page.jsx's seasonNumbers —
  // Specials appended after every real season, not sorted to the front by
  // its literal season_number 0), so nothing in this loop ever reaches it
  // before the target episode.
  const hasEarlierUnwatched = (seasonId, n) => {
    for (const s of seasons) {
      for (const e of s.episodes) {
        if (s.id === seasonId && e.n === n) return false;
        if (e.daysUntil == null && !e.watched && !e.skipped) return true;
      }
    }
    return false;
  };

  const markOnlyThis = (seasonId, n) => { setSkipMenuFor(null); setWatchNextMenuAnchor(null); toggleEp(seasonId, n); };

  // Bug fix: this used to only flip local `seasons` state for the
  // "previous episodes" and never call addEpisodeWatches for them at all
  // — only episode `n` itself got a real episode_watches row, via
  // toggleEp below. That meant the previous episodes looked watched right
  // here, but had nothing backing them in Supabase: they never showed up
  // in the Watch History calendar (which reads real rows, not this local
  // state), and reverted back to unwatched the moment this component
  // remounted and the read-only hydration effect re-seeded `seasons` from
  // what's actually in the database. Computing `newlyWatched` from the
  // outer `seasons` closure (not from inside the setSeasons updater) and
  // persisting it via addEpisodeWatches mirrors the exact pattern
  // markSeasonWithPreviousSeasons already uses correctly above — same
  // "Bangkok right now" watched_on/watched_year/watched_month every other
  // real mark-watched action gets, so these show up in Watch History
  // exactly like episode `n` does, not just the one that got a rating card.
  const markWithPrevious = (seasonId, n) => {
    if (!user) { router.push("/login"); return; }
    // s.id !== 0 — Specials never counts as "before" a regular episode
    // just because 0 < seasonId is numerically true, same reasoning as
    // hasEarlierSeasonUnwatched/markSeasonWithPreviousSeasons above.
    // !e.skipped — an already-Skipped episode is already resolved, not
    // something this sweep should overwrite with a forced watch.
    const isBefore = (s, e) => s.id !== 0 && (s.id < seasonId || (s.id === seasonId && e.n < n));
    const newlyWatched = seasons.flatMap((s) =>
      s.episodes.filter((e) => isBefore(s, e) && e.daysUntil == null && !e.watched && !e.skipped).map((e) => ({ seasonNumber: s.id, episodeNumber: e.n }))
    );
    setSeasons((ss) => ss.map((s) => ({
      ...s,
      episodes: s.episodes.map((e) => (isBefore(s, e) && e.daysUntil == null && !e.watched && !e.skipped ? { ...e, watched: true, watchCount: Math.max(e.watchCount || 0, 1) } : e)),
    })));
    setSkipMenuFor(null);
    setWatchNextMenuAnchor(null);
    if (newlyWatched.length > 0) {
      watchSeedGenRef.current += 1;
      enqueueShowWatchWrite(() => addEpisodeWatches(user.id, showId, newlyWatched)).catch(console.error);
      setPendingStatusSync(true);
    }
    toggleEp(seasonId, n);
  };

  const markOnlyThisFromDetail = () => { const { seasonId, epNumber } = activeEpisode; setActiveEpisode(null); markOnlyThis(seasonId, epNumber); };
  const markWithPreviousFromDetail = () => { const { seasonId, epNumber } = activeEpisode; setActiveEpisode(null); markWithPrevious(seasonId, epNumber); };

  const toggleCollection = (id) => {
    if (!user) { router.push("/login"); return; }
    const target = collections.find((c) => c.id === id);
    if (!target) return;
    const adding = !target.inShow;
    setCollections((cs) => {
      const updated = cs.map((c) => {
        if (c.id !== id) return c;
        const covers = c.inShow
          ? (c.covers ?? []).filter((item) => !(item.mediaType === "tv" && item.id === showId))
          : [{ id: showId, title: show.title, posterPath: show.posterPath, backdropPath: show.backdropPath, mediaType: "tv" }, ...(c.covers ?? [])].slice(0, 9);
        return { ...c, covers, inShow: !c.inShow, count: c.inShow ? Math.max(0, c.count - 1) : c.count + 1 };
      });
      // Most-recent add first — bump the collection that just received this
      // title to the top of the picker list.
      if (!adding) return updated;
      const bumped = updated.find((c) => c.id === id);
      return bumped ? [bumped, ...updated.filter((c) => c.id !== id)] : updated;
    });
    if (target.inShow) removeShowFromCollection(id, showId).catch(console.error);
    else addShowToCollection(id, showId).catch(console.error);
  };

  const createCollectionAndAdd = () => {
    if (!user) { router.push("/login"); return; }
    const name = newCollectionName.trim();
    if (!name) return;
    setNewCollectionName("");
    setNewCollectionOpen(false);
    // Keep the Collections menu open underneath so the new row appears in
    // place; only the create sheet closes.
    createCollection(user.id, name)
      .then((row) => {
        setCollections((cs) => [{
          id: row.id,
          name: row.name,
          count: 1,
          inShow: true,
          showIds: [showId],
          movieIds: [],
          covers: [{ id: showId, title: show.title, posterPath: show.posterPath, backdropPath: show.backdropPath, mediaType: "tv" }],
        }, ...cs]);
        return addShowToCollection(row.id, showId);
      })
      .catch(console.error);
  };

  const collectionConfirmActive = collections.some((c) => c.inShow);

  // Watch Next — first season with an aired-but-unwatched episode. All of
  // that season's aired episodes stay in the row; marking one just shifts
  // the auto-scroll target. Shown only after real progress exists (any
  // watched/skipped ep) or the show is already in Watching status.
  const watchNextSeason = seasons.find((s) => s.episodes.some((e) => e.daysUntil == null && !e.watched && !e.skipped));
  const watchNextEpisodes = watchNextSeason ? watchNextSeason.episodes.filter((e) => e.daysUntil == null) : [];
  const hasAnyWatchedEpisode = seasons.some((s) => s.episodes.some((e) => e.watched || e.skipped));
  const showWatchNext = Boolean(watchNextSeason && watchNextEpisodes.length > 0 && (hasAnyWatchedEpisode || resolvedStatus === "watching"));
  const watchNextRowRef = useRef(null);
  const watchedFingerprint = watchNextEpisodes.map((e) => (e.watched ? "1" : "0")).join("");
  useEffect(() => {
    const row = watchNextRowRef.current;
    if (!row || !showWatchNext) return;
    const firstUnwatchedIndex = watchNextEpisodes.findIndex((e) => !e.watched && !e.skipped);
    if (firstUnwatchedIndex < 0) return;
    const card = row.children[firstUnwatchedIndex];
    if (!card) return;
    const PEEK = 64;
    const target = firstUnwatchedIndex > 0 ? Math.max(0, card.offsetLeft - PEEK) : 0;
    row.scrollTo({ left: target, behavior: "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fingerprint string, not watchNextEpisodes identity
  }, [watchNextSeason?.id, watchedFingerprint, showWatchNext]);

  const desktopMetaParts = [
    show.yearsRange,
    show.contentRating,
    show.seasonsCount ? `${show.seasonsCount} Season${show.seasonsCount === 1 ? "" : "s"}` : null,
    show.episodeCount != null ? `${show.episodeCount} Episode${show.episodeCount === 1 ? "" : "s"}` : null,
    show.rating ? `★ ${show.rating}` : null,
  ].filter(Boolean);

  const openTrailer = () => {
    if (videos[0]) setOpenVideo(videos[0]);
  };

  const primaryProvider =
    watchProviders?.flatrate?.[0]
    || watchProviders?.rent?.[0]
    || watchProviders?.buy?.[0]
    || null;

  const desktopSeason = seasons.find((s) => s.id === desktopSeasonId) || seasons[0] || null;
  const desktopEpisodes = desktopSeason?.episodes ?? [];
  const desktopSeasonAired = desktopEpisodes.filter((e) => e.daysUntil == null);
  const desktopSeasonAllWatched = desktopSeasonAired.length > 0 && desktopSeasonAired.every((e) => e.watched || e.skipped);

  const formatUserScore = (value) => {
    if (value == null) return null;
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
  };
  const desktopSeasonRating = desktopSeason ? seasonRatings[desktopSeason.id] : null;
  const desktopSeasonScore = formatUserScore(desktopSeasonRating?.rating);

  const formatEpisodeDate = (dateStr) => {
    if (!dateStr || dateStr === "TBA") return null;
    const [y, m, d] = String(dateStr).split("-").map(Number);
    if (!y || !m || !d) return dateStr;
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${months[m - 1]} ${d}, ${y}`;
  };

  const onEpisodeCheckClick = (seasonId, e, event) => {
    event.preventDefault();
    event.stopPropagation();
    if (e.daysUntil != null) return;
    const key = `${seasonId}-${e.n}`;
    const alreadyResolved = !!(e.watched || e.skipped || (e.watchCount || 0) > 0);

    // Second+ click on a watched/skipped ep → Mark As… only.
    if (alreadyResolved) {
      setSkipMenuFor(null);
      setWatchNextMenuAnchor(null);
      setWatchMenuFor((cur) => (cur === key ? null : key));
      return;
    }

    // First click on unwatched → mark watched + rating card. Never a menu.
    markWatchedAndRate(seasonId, e);
  };

  // Desktop episode menus — same persistence as mobile, then open the
  // centered episode rating card for the target episode.
  const desktopMarkWatchedOnce = (seasonId, n) => {
    if (!setEpisodeWatchCount(seasonId, n, 1)) { setWatchMenuFor(null); return; }
    setWatchMenuFor(null);
    const season = seasons.find((s) => s.id === seasonId);
    const ep = season?.episodes.find((e) => e.n === n);
    if (ep) setRatingEpisode({ seasonId, ep: { ...ep, watched: true, watchCount: 1 } });
  };
  const desktopMarkOnlyThis = (seasonId, n) => {
    setSkipMenuFor(null);
    setWatchNextMenuAnchor(null);
    toggleEp(seasonId, n);
  };
  const desktopMarkWithPrevious = (seasonId, n) => {
    if (!user) { router.push("/login"); return; }
    const isBefore = (s, e) => s.id !== 0 && (s.id < seasonId || (s.id === seasonId && e.n < n));
    const newlyWatched = seasons.flatMap((s) =>
      s.episodes.filter((e) => isBefore(s, e) && e.daysUntil == null && !e.watched && !e.skipped).map((e) => ({ seasonNumber: s.id, episodeNumber: e.n }))
    );
    setSeasons((ss) => ss.map((s) => ({
      ...s,
      episodes: s.episodes.map((e) => (isBefore(s, e) && e.daysUntil == null && !e.watched && !e.skipped ? { ...e, watched: true, watchCount: Math.max(e.watchCount || 0, 1) } : e)),
    })));
    setSkipMenuFor(null);
    setWatchNextMenuAnchor(null);
    if (newlyWatched.length > 0) {
      watchSeedGenRef.current += 1;
      enqueueShowWatchWrite(() => addEpisodeWatches(user.id, showId, newlyWatched)).catch(console.error);
      setPendingStatusSync(true);
    }
    toggleEp(seasonId, n);
  };

  useEffect(() => {
    if (!desktopMoreOpen) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") setDesktopMoreOpen(false);
    };
    const onPointer = (event) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target)) setDesktopMoreOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointer);
    };
  }, [desktopMoreOpen]);

  // Place the ••• menu to the right of the trigger, vertically centered on
  // the button (not dropping below it). Flip left only when the right side
  // is too tight — never prefer up/down as the primary placement.
  useLayoutEffect(() => {
    if (!desktopMoreOpen) {
      setDesktopMorePos(null);
      return undefined;
    }

    const MENU_W = 236;
    const GAP = 10;
    const EDGE = 16;

    const place = () => {
      const btn = moreMenuBtnRef.current;
      const panel = moreMenuPanelRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const menuH = panel?.offsetHeight || 168;

      const spaceRight = vw - rect.right - GAP - EDGE;
      const spaceLeft = rect.left - GAP - EDGE;
      const side = spaceRight >= MENU_W || spaceRight >= spaceLeft ? "right" : "left";

      let left = side === "right"
        ? rect.right + GAP
        : rect.left - GAP - MENU_W;
      // Vertically center on the ••• button.
      let top = rect.top + rect.height / 2 - menuH / 2;

      top = Math.min(top, vh - menuH - EDGE);
      top = Math.max(EDGE, top);
      left = Math.min(left, vw - MENU_W - EDGE);
      left = Math.max(EDGE, left);

      setDesktopMorePos({ top, left, side });
    };

    place();
    // Remeasure after paint once the panel has real height.
    const raf = requestAnimationFrame(place);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [desktopMoreOpen]);

  // Collections modal — Escape closes.
  useEffect(() => {
    if (!collectionAllOpen) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") setCollectionAllOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [collectionAllOpen]);

  // Dismiss Mark As… / skip-ahead / mark-season menus on outside click or Escape.
  // Watch Next already has its own full-screen dismiss layer when anchored.
  useEffect(() => {
    const menuOpen = watchMenuFor != null || skipMenuFor != null || skipSeasonMenuFor != null;
    if (!menuOpen || watchNextMenuAnchor) return undefined;

    const closeMenus = () => {
      setWatchMenuFor(null);
      setSkipMenuFor(null);
      setSkipSeasonMenuFor(null);
    };

    const onKey = (event) => {
      if (event.key === "Escape") closeMenus();
    };

    const onPointer = (event) => {
      const el = event.target;
      if (!(el instanceof Element)) return;
      // Keep the menu open when interacting with it or its trigger controls.
      if (el.closest(".show-desktop-ep-menu")) return;
      if (el.closest(".show-desktop-ep-check")) return;
      if (el.closest(".show-desktop-mark-all")) return;
      closeMenus();
    };

    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointer);
    };
  }, [watchMenuFor, skipMenuFor, skipSeasonMenuFor, watchNextMenuAnchor]);

  return (
    <div className="min-h-dvh" style={{ background: t.bg }}>
      <div className="pb-8">

        {/* ---------- Mobile / tablet hero + intro ---------- */}
        <div className="show-mobile-layout">
          {/* hero — 45px taller than the backdrop image alone needs, so the
              floating poster (and everything below it, which just follows in
              normal flow right after this div) sits 45px lower, leaving more
              of the backdrop visible above it. The poster's own `top` below
              is shifted by the same 45px, so the gap between the poster's
              bottom edge and the title block underneath is unchanged — only
              the whole unit's starting position moved, not its internal
              spacing. */}
          <div className="relative w-full" style={{ height: 415 }}>
            <PosterArt posterPath={show.backdropPath} overrideSrc={customBackdropUrl} base={show.base} glow={show.glow} alt={displayTitle} tmdbSize="original" sizes="100vw" />
            <div className="absolute inset-0" style={{ background: "linear-gradient(0deg, #0A0A0C 0%, rgba(10,10,12,0.2) 60%, transparent 100%)" }} />
            <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-6 z-10" style={{ paddingTop: "calc(env(safe-area-inset-top) + 12px)" }}>
              <GlassButton onClick={() => router.back()} style={{ width: 38, height: 38 }}><Icon name="back" size={16} color={t.text} /></GlassButton>
              <div className="relative">
                <GlassButton onClick={() => setMoreOpen((v) => !v)} style={{ width: 38, height: 38 }}><Icon name="more" size={16} color={t.text} /></GlassButton>
                {moreOpen && (
                  <div className="absolute z-20 rounded-2xl" style={{ right: 0, top: "calc(100% + 8px)", width: 200, padding: "6px", background: "rgba(38,38,42,0.93)", border: `1px solid ${t.glassBorder}`, backdropFilter: "blur(24px)", boxShadow: "0 20px 44px rgba(0,0,0,0.55)" }}>
                    {moreMenuItems.map((m) => (
                      <button key={m.id} onClick={() => { setMoreOpen(false); if (m.id === "tags") setCollectionSheetOpen(true); else if (m.pickerType) router.push(`/show/${showId}?picker=${m.pickerType}`); }} className="w-full flex items-center gap-3 rounded-xl active:scale-95 transition" style={{ padding: "10px 12px" }}>
                        <Icon name={m.icon} size={16} color="#fff" />
                        <span style={{ fontSize: 13.5, color: "#fff", fontWeight: 500 }}>{m.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* centered floating poster, smaller */}
            <div className="absolute left-1/2" style={{ top: 195, transform: "translateX(-50%)", width: 140, height: 200 }}>
              <div className="relative w-full h-full rounded-2xl overflow-hidden" style={{ boxShadow: "0 16px 40px rgba(0,0,0,0.6)" }}>
                <PosterArt posterPath={show.posterPath} overrideSrc={customPosterUrl} base={show.base} glow={show.glow} alt={displayTitle} />
                {!show.posterPath && !customPosterUrl && (
                  <div className="absolute inset-0 flex items-end justify-center" style={{ paddingBottom: 12 }}>
                    <span style={{ fontSize: 16, fontWeight: 800, color: "#f4ead9", letterSpacing: "0.25em" }}>{displayTitle.toUpperCase()}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="px-6" style={{ marginTop: 8, position: "relative", zIndex: 20 }}>
            {show.tagline && (
              <div className="text-center" style={{ fontSize: 13, fontStyle: "italic", color: t.textDim, marginBottom: 18 }}>
                {show.tagline}
              </div>
            )}
            {customLogoUrl || autoLogoUrl ? (
              <div className="flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element -- a resolved TMDB CDN URL, not a next/image-managed path */}
                <img
                  src={customLogoUrl || autoLogoUrl}
                  alt={displayTitle}
                  onError={() => { if (!customLogoUrl) setAutoLogoFailed(true); }}
                  style={{ maxWidth: "80%", maxHeight: 72, objectFit: "contain" }}
                />
              </div>
            ) : (
              <div className="text-center" style={{ fontSize: 30, fontWeight: 800, color: "#fff", letterSpacing: "0.01em" }}>{displayTitle}</div>
            )}
            <div className="text-center" style={{ fontSize: 12, color: t.textDim, marginTop: 9 }}>{show.yearsRange} · {show.genres} · ★ {show.rating}</div>

            <div className="flex items-center justify-center gap-2.5" style={{ marginTop: 17 }}>
              {!inLibrary ? (
                <button onClick={addToLibrary} className="flex items-center gap-2 rounded-full active:scale-95 transition" style={{ padding: "10px 20px", background: "#fff", color: "#111" }}>
                  <Icon name="plus" size={14} color="#111" />
                  <span style={{ fontSize: 13.5, fontWeight: 600 }}>Add to List</span>
                </button>
              ) : (
                <>
                  <div className="relative">
                    {statusOpen && (
                      <>
                        <div className="fixed inset-0 z-20" onClick={() => setStatusOpen(false)} />
                        <StatusMenu status={resolvedStatus} onSelect={selectStatus} align="center" />
                      </>
                    )}
                    <button onClick={() => setStatusOpen((v) => !v)} className="flex items-center gap-2 rounded-full active:scale-95 transition" style={{ padding: "10px 18px", background: "#fff", color: "#111" }}>
                      <Icon name={resolvedStatus === "watchlist" ? "bookmarkFilled" : statusMenuOptions.find((s) => s.id === resolvedStatus)?.icon ?? "bookmark"} size={15} color="#111" />
                      <span style={{ fontSize: 13.5, fontWeight: 600 }}>{statusMenuOptions.find((s) => s.id === resolvedStatus)?.label ?? "Watchlist"}</span>
                    </button>
                  </div>
                  <GlassButton onClick={() => {
                    if (!user) { router.push("/login"); return; }
                    toggleFavorite(showId, "ShowDetailClient:toggleFavorite");
                  }} style={{ width: 40, height: 40 }}>
                    <Icon name={favorite ? "heart" : "heartOutline"} size={16} color={favorite ? "#e0567a" : "#fff"} />
                  </GlassButton>
                </>
              )}
            </div>

            <div className="mt-4" style={{ fontSize: 13, lineHeight: 1.5, color: "rgba(255,255,255,0.72)" }}>
              {show.descriptionFull}
            </div>
          </div>
        </div>

        {/* ---------- Desktop hero + info strip ---------- */}
        <div className="show-desktop-layout">
          <section className="show-desktop-hero">
            <div className="show-desktop-backdrop">
              <PosterArt posterPath={show.backdropPath} overrideSrc={customBackdropUrl} base={show.base} glow={show.glow} alt="" tmdbSize="original" sizes="100vw" />
              <div className="show-desktop-backdrop-scrim" />
            </div>

            <div className="show-desktop-hero-main">
              <div className="show-desktop-poster">
                <PosterArt posterPath={show.posterPath} overrideSrc={customPosterUrl} base={show.base} glow={show.glow} alt={displayTitle} />
              </div>

              <div className="show-desktop-copy">
                {customLogoUrl || autoLogoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- resolved TMDB CDN URL
                  <img
                    className="show-desktop-logo"
                    src={customLogoUrl || autoLogoUrl}
                    alt={displayTitle}
                    onError={() => { if (!customLogoUrl) setAutoLogoFailed(true); }}
                  />
                ) : (
                  <h1>{displayTitle}</h1>
                )}

                <div className="show-desktop-meta">
                  {desktopMetaParts.map((part, i) => (
                    <span key={`${part}-${i}`}>{i > 0 ? `• ${part}` : part}</span>
                  ))}
                  {show.statusLabel ? <span className="is-status">• {show.statusLabel}</span> : null}
                </div>

                {show.genresList?.length > 0 && (
                  <div className="show-desktop-genres">
                    {show.genresList.map((g) => (
                      <span key={g} className="show-desktop-genre">{g}</span>
                    ))}
                  </div>
                )}

                <div className="show-desktop-actions">
                  <div className={`relative show-desktop-status-wrap${statusOpen ? " is-open" : ""}`}>
                    {statusOpen && (
                      <>
                        <div className="show-desktop-status-scrim" onClick={() => setStatusOpen(false)} />
                        <StatusMenu status={resolvedStatus} onSelect={selectStatus} align="left" style={{ zIndex: 110 }} />
                      </>
                    )}
                    {!inLibrary ? (
                      <button type="button" className="show-desktop-action is-light" onClick={addToLibrary}>
                        <Icon name="plus" size={15} color="#111" />
                        Add to List
                      </button>
                    ) : (
                      <button type="button" className="show-desktop-action is-light" onClick={() => setStatusOpen((v) => !v)}>
                        <Icon name={resolvedStatus === "watchlist" ? "bookmarkFilled" : statusMenuOptions.find((s) => s.id === resolvedStatus)?.icon ?? "bookmark"} size={15} color="#111" />
                        {statusMenuOptions.find((s) => s.id === resolvedStatus)?.label ?? "Watchlist"}
                      </button>
                    )}
                  </div>

                  <GlassButton
                    onClick={() => {
                      if (!user) { router.push("/login"); return; }
                      // Favoriting requires a library row — open status picker
                      // first when this show isn't in the library yet.
                      if (!inLibrary) {
                        addToLibrary();
                        return;
                      }
                      toggleFavorite(showId, "ShowDetailClient:desktopFavorite");
                    }}
                    style={{ width: 42, height: 42 }}
                    aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
                  >
                    <Icon name={favorite ? "heart" : "heartOutline"} size={16} color={favorite ? "#e0567a" : "#fff"} />
                  </GlassButton>

                  {videos[0] && (
                    <button type="button" className="show-desktop-action is-secondary" onClick={openTrailer}>
                      <Icon name="clapperboard" size={16} color="#fff" strokeWidth={1.7} />
                      Trailer
                    </button>
                  )}

                  <button
                    type="button"
                    className={`show-desktop-action is-secondary${desktopSeasonRating ? " is-rated" : ""}`}
                    onClick={() => {
                      if (!user) { router.push("/login"); return; }
                      const target = desktopSeason?.id ?? seasons[0]?.id;
                      if (target == null) return;
                      openReviewSeason(target);
                    }}
                    aria-label={desktopSeasonScore ? `Your rating ${desktopSeasonScore}` : "Rating"}
                  >
                    <Icon
                      name={desktopSeasonRating ? "star" : "starOutline"}
                      size={16}
                      color={desktopSeasonRating ? accent : "#fff"}
                    />
                    {desktopSeasonScore ?? "Rating"}
                  </button>

                  <GlassButton
                    onClick={() => {
                      if (!user) { router.push("/login"); return; }
                      setStatusOpen(false);
                      setDesktopMoreOpen(false);
                      setCollectionAllOpen(true);
                    }}
                    style={{ width: 42, height: 42 }}
                    aria-label="Add to a Collection"
                    aria-haspopup="dialog"
                    aria-expanded={collectionAllOpen}
                  >
                    <Icon name="collection" size={16} color="#fff" />
                  </GlassButton>

                  <div className="relative" ref={moreMenuRef}>
                    <button
                      type="button"
                      ref={moreMenuBtnRef}
                      className="show-desktop-more"
                      aria-label="More options"
                      aria-haspopup="menu"
                      aria-expanded={desktopMoreOpen}
                      onClick={() => { setStatusOpen(false); setDesktopMoreOpen((v) => !v); }}
                    >
                      <Icon name="more" size={16} color="#fff" />
                    </button>
                    {desktopMoreOpen && (
                      <div
                        ref={moreMenuPanelRef}
                        className={`show-desktop-more-menu${desktopMorePos ? " is-placed" : ""}${desktopMorePos?.side ? ` is-${desktopMorePos.side}` : ""}`}
                        role="menu"
                        style={desktopMorePos ? {
                          top: desktopMorePos.top,
                          left: desktopMorePos.left,
                          background: "rgba(48,50,54,0.96)",
                          border: "1px solid rgba(255,255,255,0.12)",
                          backdropFilter: "blur(28px) saturate(140%)",
                          WebkitBackdropFilter: "blur(28px) saturate(140%)",
                        } : undefined}
                      >
                        {moreMenuItems.filter((m) => m.id !== "tags").map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            role="menuitem"
                            className="show-desktop-more-item"
                            onClick={() => {
                              setDesktopMoreOpen(false);
                              if (m.pickerType) router.push(`/show/${showId}?picker=${m.pickerType}`);
                            }}
                          >
                            <Icon name={m.icon} size={16} color="#fff" />
                            <span>{m.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {show.descriptionFull ? <p className="show-desktop-overview">{show.descriptionFull}</p> : null}
              </div>
            </div>
          </section>

          <section className="show-desktop-strip" aria-label="Show details">
            {primaryProvider ? (
              watchProviders?.link ? (
                <a
                  className="show-desktop-strip-item is-watch"
                  href={watchProviders.link}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <div className="show-desktop-strip-logo">
                    {primaryProvider.logoPath && (
                      <Image src={tmdbImage(primaryProvider.logoPath, "w92")} alt="" fill sizes="36px" style={{ objectFit: "cover" }} />
                    )}
                  </div>
                  <div>
                    <span className="show-desktop-strip-kicker">WATCH ON</span>
                    <strong>
                      {primaryProvider.name}
                      <Icon name="chevronRight" size={14} color="rgba(255,255,255,0.55)" />
                    </strong>
                  </div>
                </a>
              ) : (
                <div className="show-desktop-strip-item is-watch">
                  <div className="show-desktop-strip-logo">
                    {primaryProvider.logoPath && (
                      <Image src={tmdbImage(primaryProvider.logoPath, "w92")} alt="" fill sizes="36px" style={{ objectFit: "cover" }} />
                    )}
                  </div>
                  <div>
                    <span className="show-desktop-strip-kicker">WATCH ON</span>
                    <strong>{primaryProvider.name}</strong>
                  </div>
                </div>
              )
            ) : (
              <div className="show-desktop-strip-item is-watch">
                <div className="show-desktop-strip-logo is-empty"><Icon name="tv" size={16} color="rgba(255,255,255,0.45)" /></div>
                <div>
                  <span className="show-desktop-strip-kicker">WATCH ON</span>
                  <strong>Unavailable</strong>
                </div>
              </div>
            )}

            <div className="show-desktop-strip-item">
              <Icon name="clock" size={15} color="rgba(255,255,255,0.45)" />
              <div>
                <span className="show-desktop-strip-kicker">STATUS</span>
                <strong className={show.statusLabel ? "is-status" : undefined}>{show.statusLabel || "—"}</strong>
              </div>
            </div>

            <div className="show-desktop-strip-item">
              <Icon name="star" size={15} color="rgba(255,255,255,0.45)" />
              <div>
                <span className="show-desktop-strip-kicker">RATING</span>
                <strong>{show.rating || "—"}</strong>
              </div>
            </div>

            <div className="show-desktop-strip-item">
              <Icon name="calendar" size={15} color="rgba(255,255,255,0.45)" />
              <div>
                <span className="show-desktop-strip-kicker">FIRST AIR DATE</span>
                <strong>{show.firstAirDate || "—"}</strong>
              </div>
            </div>

            <div className="show-desktop-strip-item">
              <Icon name="globe" size={15} color="rgba(255,255,255,0.45)" />
              <div>
                <span className="show-desktop-strip-kicker">COUNTRY</span>
                <strong>{show.originCountry || "—"}</strong>
              </div>
            </div>

            <div className="show-desktop-strip-item">
              <Icon name="user" size={15} color="rgba(255,255,255,0.45)" />
              <div>
                <span className="show-desktop-strip-kicker">CREATOR</span>
                <strong>{show.creator !== "—" ? show.creator : "—"}</strong>
              </div>
            </div>
          </section>
        </div>

        <div className="show-detail-body px-6" style={{ marginTop: 8, position: "relative", zIndex: 20 }}>
          {/* Mobile tabs only — desktop hides the "Episodes" heading and
              shows season/episode cards directly under the hero. */}
          <div
            className="mt-5 flex gap-5 show-detail-tabs"
            style={{ borderBottom: `1px solid ${t.cardBorder}` }}
          >
            {[
              { id: "episodes", label: "Episodes", hideOnDesktop: true },
              { id: "details", label: "Details", hideOnDesktop: true },
              { id: "cast", label: "Cast & Crew", hideOnDesktop: true },
            ].map((tb) => (
              <button key={tb.id} onClick={() => setTab(tb.id)} className={`show-detail-tab-btn pb-2.5${tb.hideOnDesktop ? " show-detail-tab-mobile-only" : ""}`} style={{
                fontWeight: 600, color: tab === tb.id ? "#fff" : t.textDim,
                borderBottom: tab === tb.id ? `2px solid ${accent}` : "2px solid transparent",
              }}>{tb.label}</button>
            ))}
          </div>

          {/* ---------- Episodes tab ---------- */}
          {tab === "episodes" && (
            <div className="mt-4 flex flex-col gap-3">
              {showWatchNext && (
                <div className="show-watch-next">
                  <div className="flex items-center justify-between mb-3">
                    <span className="show-watch-next-title">Watch Next</span>
                    <span className="show-watch-next-season">{watchNextSeason.title}</span>
                  </div>
                  <div ref={watchNextRowRef} className="flex gap-3 overflow-x-auto" style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}>
                    {watchNextEpisodes.map((e) => {
                      const isWatched = !!e.watched && !e.skipped;
                      const isRewatch = isWatched && (e.watchCount || 1) >= 2;
                      return (
                        <div
                          key={e.n}
                          onClick={() => setActiveEpisode({ seasonId: watchNextSeason.id, epNumber: e.n })}
                          className="relative flex-shrink-0 rounded-2xl overflow-hidden cursor-pointer active:scale-[0.98] transition show-watch-next-card"
                        >
                          <PosterArt posterPath={e.posterPath} base={e.base} glow={e.glow} alt={e.title} />
                          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(0deg, rgba(0,0,0,0.75) 0%, transparent 55%)" }} />
                          <div className="absolute left-0 right-0 bottom-0 show-watch-next-card-copy">
                            <div className="show-watch-next-ep-label">EPISODE {e.n}</div>
                            <div className="show-watch-next-ep-title">{e.title}</div>
                          </div>
                          <div className="absolute" style={{ right: 10, bottom: 10 }}>
                            <button
                              type="button"
                              onClick={(ev) => {
                                ev.stopPropagation();
                                const rect = ev.currentTarget.getBoundingClientRect();
                                if (e.watched || e.skipped) {
                                  setSkipMenuFor(null);
                                  setWatchMenuFor(`${watchNextSeason.id}-${e.n}`);
                                  setWatchNextMenuAnchor({ rect, seasonId: watchNextSeason.id, epNumber: e.n, watchCount: e.watchCount });
                                  return;
                                }
                                if (hasEarlierUnwatched(watchNextSeason.id, e.n)) {
                                  setWatchMenuFor(null);
                                  setSkipMenuFor(`${watchNextSeason.id}-${e.n}`);
                                  setWatchNextMenuAnchor({ rect, seasonId: watchNextSeason.id, epNumber: e.n });
                                  return;
                                }
                                markWatchedAndRate(watchNextSeason.id, e);
                              }}
                              className={`show-desktop-ep-check-btn active:scale-90 transition${isWatched ? " is-watched" : ""}${e.watched || e.skipped ? " is-resolved" : ""}`}
                              style={e.skipped ? { background: SKIPPED_GREY, borderColor: SKIPPED_GREY } : undefined}
                            >
                              {isRewatch
                                ? <span style={{ fontSize: 11, fontWeight: 700, color: "#111" }}>×{e.watchCount}</span>
                                : e.skipped
                                ? <Icon name="skip" size={13} color="#fff" />
                                : <Icon name="check" size={13} color={isWatched ? "#111" : "#fff"} strokeWidth={2.2} />}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Watch Next row's own Mark As…/Set Watch Status popups —
                  rendered here via position:fixed (anchored off
                  watchNextMenuAnchor, captured at the triggering button's
                  own click) instead of nested inside the row above, which
                  clips them — see watchNextMenuAnchor's own comment for
                  why. Flips above/left instead of the original fixed
                  below-right placement whenever it wouldn't fit. */}
              {watchNextMenuAnchor && (watchMenuFor === `${watchNextMenuAnchor.seasonId}-${watchNextMenuAnchor.epNumber}` || skipMenuFor === `${watchNextMenuAnchor.seasonId}-${watchNextMenuAnchor.epNumber}`) && (() => {
                const { rect, seasonId, epNumber, watchCount } = watchNextMenuAnchor;
                const isMarkAs = watchMenuFor === `${seasonId}-${epNumber}`;
                const width = isMarkAs ? 210 : 220;
                const estHeight = isMarkAs ? 200 : 110;
                const fitsBelow = window.innerHeight - rect.bottom >= estHeight + 8;
                const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
                const positionStyle = fitsBelow ? { top: rect.bottom + 8 } : { bottom: window.innerHeight - rect.top + 8 };
                return (
                  <div className="fixed inset-0 z-40" onClick={() => { setWatchMenuFor(null); setSkipMenuFor(null); setWatchNextMenuAnchor(null); }}>
                    <div
                      className="fixed show-desktop-ep-menu is-anchored"
                      style={{ left, width, ...positionStyle }}
                      onClick={(ev) => ev.stopPropagation()}
                    >
                      {isMarkAs ? (
                        <>
                          <div className="show-desktop-ep-menu-label">MARK AS…</div>
                          <button type="button" onClick={() => { markNotWatched(seasonId, epNumber); setWatchNextMenuAnchor(null); }}><Icon name="eyeOff" size={15} color="#fff" /><span>Not Watched</span></button>
                          <button type="button" onClick={() => { markSkipped(seasonId, epNumber); setWatchNextMenuAnchor(null); }}><Icon name="skip" size={15} color="#fff" /><span>Skipped</span></button>
                          <button type="button" onClick={() => { markRewatched(seasonId, epNumber, watchCount); setWatchNextMenuAnchor(null); }}><span className="show-desktop-ep-menu-badge">+1</span><span>Rewatched</span></button>
                          <button type="button" onClick={() => { markWatchedOnce(seasonId, epNumber); setWatchNextMenuAnchor(null); }}><span className="show-desktop-ep-menu-badge">1</span><span>Watched Once</span></button>
                        </>
                      ) : (
                        <>
                          <div className="show-desktop-ep-menu-label">SET WATCH STATUS</div>
                          <button type="button" onClick={() => { markOnlyThis(seasonId, epNumber); setWatchNextMenuAnchor(null); }}><Icon name="checkCircle" size={18} color={accent} /><span>Only for this episode</span></button>
                          <button type="button" onClick={() => { markWithPrevious(seasonId, epNumber); setWatchNextMenuAnchor(null); }}><Icon name="collection" size={17} color="#fff" /><span>Previous episodes too</span></button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Desktop season grid — replaces the mobile accordion below. */}
              <div className="show-desktop-episodes">
                <div className="show-desktop-season-tabs" role="tablist" aria-label="Seasons">
                  {seasons.map((season) => (
                    <button
                      key={season.id}
                      type="button"
                      role="tab"
                      aria-selected={(desktopSeason?.id ?? null) === season.id}
                      className={`show-desktop-season-tab${(desktopSeason?.id ?? null) === season.id ? " is-active" : ""}`}
                      onClick={() => { setDesktopSeasonId(season.id); setSkipSeasonMenuFor(null); }}
                    >
                      {season.title}
                    </button>
                  ))}
                </div>

                {desktopSeason && (
                  <div className="show-desktop-ep-controls">
                    <div className="relative">
                      <button
                        type="button"
                        className={`show-desktop-mark-all${desktopSeasonAllWatched ? " is-done" : ""}`}
                        onClick={() => {
                          if (desktopSeasonAllWatched) { unmarkSeasonWatched(desktopSeason.id); return; }
                          if (hasEarlierSeasonUnwatched(desktopSeason.id)) { setSkipSeasonMenuFor(desktopSeason.id); return; }
                          markSeasonWatched(desktopSeason.id);
                        }}
                      >
                        <span className="show-desktop-mark-all-check">
                          <Icon
                            name="check"
                            size={13}
                            color={desktopSeasonAllWatched ? "#111" : "rgba(255,255,255,0.55)"}
                            strokeWidth={2}
                          />
                        </span>
                        {desktopSeasonAllWatched ? "Season watched" : "Mark season as watched"}
                      </button>
                      {skipSeasonMenuFor === desktopSeason.id && (
                        <div className="show-desktop-ep-menu show-desktop-mark-all-menu">
                          <div className="show-desktop-ep-menu-label">SET WATCH STATUS</div>
                          <button type="button" onClick={() => markSeasonWatched(desktopSeason.id)}><Icon name="checkCircle" size={18} color={accent} /><span>Mark season watched</span></button>
                          <button type="button" onClick={() => markSeasonWithPreviousSeasons(desktopSeason.id)}><Icon name="collection" size={17} color="#fff" /><span>Previous seasons too</span></button>
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      className={`show-desktop-mark-all${desktopSeasonRating ? " is-rated" : ""}`}
                      onClick={() => openReviewSeason(desktopSeason.id)}
                    >
                      <span className="show-desktop-mark-all-check">
                        <Icon
                          name={desktopSeasonRating ? "star" : "starOutline"}
                          size={13}
                          color={desktopSeasonRating ? "#111" : "rgba(255,255,255,0.55)"}
                          strokeWidth={2}
                        />
                      </span>
                      {desktopSeasonScore ?? "Rate this season"}
                    </button>
                  </div>
                )}

                <div className="show-desktop-ep-grid">
                  {desktopSeason && desktopEpisodes.map((e) => {
                    const seasonId = desktopSeason.id;
                    const epDate = formatEpisodeDate(e.date);
                    const runtimeLabel = e.runtime ? `${e.runtime} min` : null;
                    const menuKey = `${seasonId}-${e.n}`;
                    const isWatched = !!e.watched && !e.skipped;
                    const isRewatch = isWatched && (e.watchCount || 1) >= 2;
                    return (
                      <article key={menuKey} className="show-desktop-ep-card">
                        <div className="show-desktop-ep-thumb-wrap">
                          <div className="show-desktop-ep-thumb" onClick={() => setActiveEpisode({ seasonId, epNumber: e.n })}>
                            <PosterArt className="show-desktop-ep-still" posterPath={e.posterPath} base={e.base} glow={e.glow} alt={e.title} flat tmdbSize="w780" sizes="(min-width: 900px) 33vw, 100vw" />
                            {e.watched && e.myRating ? (
                              <div className="show-desktop-ep-user-rating show-desktop-ep-thumb-rating">
                                <Icon name="star" size={10} color={accent} />
                                <span>{e.myRating.toFixed(1)}/5</span>
                              </div>
                            ) : null}
                            {e.daysUntil != null && e.daysUntil !== Infinity && (
                              <div className="show-desktop-ep-countdown">{e.daysUntil === 0 ? "Today" : e.daysUntil === 1 ? "Tomorrow" : `${e.daysUntil} days`}</div>
                            )}
                          </div>
                          {e.daysUntil == null && (
                            <div className="show-desktop-ep-check">
                              <button
                                type="button"
                                aria-label={e.watched ? "Mark episode options" : "Mark watched"}
                                onClick={(event) => onEpisodeCheckClick(seasonId, e, event)}
                                className={`show-desktop-ep-check-btn${isWatched ? " is-watched" : ""}${e.watched || e.skipped ? " is-resolved" : ""}`}
                                style={e.skipped ? { background: SKIPPED_GREY, borderColor: SKIPPED_GREY } : undefined}
                              >
                                {isRewatch
                                  ? <span style={{ fontSize: 11, fontWeight: 700, color: "#111" }}>×{e.watchCount}</span>
                                  : e.skipped
                                  ? <Icon name="skip" size={13} color="#fff" />
                                  : <Icon name="check" size={13} color={isWatched ? "#111" : "#fff"} strokeWidth={2.2} />}
                              </button>
                              {watchMenuFor === menuKey && !watchNextMenuAnchor && (e.watched || e.skipped) && (
                                <div className="show-desktop-ep-menu" onClick={(event) => event.stopPropagation()}>
                                  <div className="show-desktop-ep-menu-label">MARK AS…</div>
                                  <button type="button" onClick={() => markNotWatched(seasonId, e.n)}><Icon name="eyeOff" size={15} color="#fff" /><span>Not Watched</span></button>
                                  <button type="button" onClick={() => markSkipped(seasonId, e.n)}><Icon name="skip" size={15} color="#fff" /><span>Skipped</span></button>
                                  <button type="button" onClick={() => markRewatched(seasonId, e.n, e.watchCount)}><span className="show-desktop-ep-menu-badge">+1</span><span>Rewatched</span></button>
                                  <button type="button" onClick={() => desktopMarkWatchedOnce(seasonId, e.n)}><span className="show-desktop-ep-menu-badge">1</span><span>Watched Once</span></button>
                                </div>
                              )}
                              {/* Skip-ahead menu removed from first-mark flow — first click
                                  always marks watched + opens rating. Keep this slot unused
                                  on desktop grid so an unwatched ep can never show a dropdown. */}
                              {false && skipMenuFor === menuKey && !watchNextMenuAnchor && (
                                <div className="show-desktop-ep-menu" onClick={(event) => event.stopPropagation()}>
                                  <div className="show-desktop-ep-menu-label">SET WATCH STATUS</div>
                                  <button type="button" onClick={() => desktopMarkOnlyThis(seasonId, e.n)}><Icon name="checkCircle" size={18} color={accent} /><span>Only for this episode</span></button>
                                  <button type="button" onClick={() => desktopMarkWithPrevious(seasonId, e.n)}><Icon name="collection" size={17} color="#fff" /><span>Previous episodes too</span></button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="show-desktop-ep-label">
                          <span>
                            {desktopSeason.id > 0
                              ? tr("seasonEpisode", { s: desktopSeason.id, e: e.n })
                              : `${desktopSeason.title}, Episode ${e.n}`}
                          </span>
                        </div>
                        <h3 className="show-desktop-ep-title" onClick={() => setActiveEpisode({ seasonId, epNumber: e.n })}>
                          <span>{e.title}</span>
                        </h3>
                        {e.synopsis ? <p className="show-desktop-ep-synopsis">{e.synopsis}</p> : null}
                        <div className="show-desktop-ep-meta">
                          {runtimeLabel && <span>{runtimeLabel}</span>}
                          {epDate && <span>{epDate}</span>}
                        </div>
                      </article>
                    );
                  })}
                </div>
                {desktopEpisodes.length === 0 && (
                  <div className="show-desktop-ep-empty">No episodes in this season yet.</div>
                )}
              </div>

              <div className="show-mobile-episodes">
              {seasons.map((season) => {
                // watchedCount: real watches only — feeds the "X/Y watched"
                // text label below, which must keep meaning literally
                // "watched," not "resolved" (a Skipped episode counting
                // toward that label would misreport actual watch stats).
                // resolvedCount (watched OR skipped) drives the ring/
                // allWatched/percentage instead — completion, not a watch
                // count. Both apply the same within any single season,
                // Specials included: Specials' own card still tracks and
                // completes normally, it just never feeds the OVERALL
                // show's resolvedReleasedEpisodes sum above.
                const watchedCount = season.episodes.filter((e) => e.watched).length;
                const resolvedCount = season.episodes.filter((e) => e.watched || e.skipped).length;
                const total = season.episodes.length;
                const airedTotal = season.episodes.filter((e) => e.daysUntil == null).length;
                const allWatched = airedTotal > 0 && resolvedCount === airedTotal;
                // Same airedTotal denominator as allWatched, so the pie
                // reaches a full circle at exactly the same point allWatched
                // flips true — not a separate, possibly-disagreeing measure.
                const seasonProgressPct = airedTotal > 0 ? Math.round((resolvedCount / airedTotal) * 100) : 0;
                const isOpen = expandedSeason === season.id;
                return (
                  <div key={season.id} className="rounded-2xl" style={{ background: t.cardFill, border: `1px solid ${t.cardBorder}`, overflow: (isOpen || skipSeasonMenuFor === season.id) ? "visible" : "hidden" }}>
                    <div onClick={() => setExpandedSeason(isOpen ? null : season.id)} role="button" tabIndex={0} className="w-full flex items-center gap-3 active:scale-[0.99] transition" style={{ padding: "10px", cursor: "pointer" }}>
                      {/* A real 2:3 poster shape, not a square crop — a
                          square thumbnail was cutting off most of the real
                          poster art (faces/logos routinely fell outside a
                          56x56 crop). */}
                      <div className="relative flex-shrink-0" style={{ width: 52, height: 78, borderRadius: 10, overflow: "hidden" }}>
                        <PosterArt posterPath={season.posterPath} base={season.base} glow={season.glow} alt={season.title} />
                      </div>
                      <div className="flex-1 text-left">
                        <div className="flex items-center gap-1.5">
                          <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{season.title}</span>
                          <span style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}><Icon name="chevronDown" size={13} color={t.textDim} /></span>
                        </div>
                        <div style={{ fontSize: 11.5, color: t.textDim, marginTop: 2 }}>{watchedCount}/{total} watched</div>
                      </div>
                      <div onClick={(ev) => {
                        ev.stopPropagation();
                        if (allWatched) { unmarkSeasonWatched(season.id); return; }
                        if (hasEarlierSeasonUnwatched(season.id)) { setSkipSeasonMenuFor(season.id); return; }
                        markSeasonWatched(season.id);
                      }} className="relative flex-shrink-0 active:scale-90 transition flex items-center justify-center" style={{ width: 26, height: 26 }}>
                        {/* Pie-chart-style progress, not a binary empty/
                            full circle — the amber arc grows with every
                            episode marked watched in this season. An SVG
                            stroke ring rather than conic-gradient's `color
                            X%, color2 X%` hard-stop trick — that trick
                            renders a stray sliver of the first color right
                            at the seam in some browsers (a rounding/
                            antialiasing artifact at the exact stop
                            boundary, worse the smaller the element), which
                            is exactly the "tiny dot" bug this replaces.
                            Once allWatched, though, a 100%-drawn ring still
                            only outlines the circle — its center stays
                            empty/transparent, reading as a hollow ring
                            instead of "done". Swapping to a solid filled
                            disc at that point (checkmark on top, same dark
                            #1a1108 this app already uses for icons drawn on
                            amber elsewhere) is what actually reads as
                            complete. */}
                        <svg width={24} height={24} viewBox="0 0 24 24" style={{ transform: "rotate(-90deg)" }}>
                          {allWatched ? (
                            <circle cx={12} cy={12} r={11} fill={accent} />
                          ) : (
                            <>
                              <circle cx={12} cy={12} r={SEASON_RING_RADIUS} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={2.5} />
                              {seasonProgressPct > 0 && (
                                <circle
                                  cx={12}
                                  cy={12}
                                  r={SEASON_RING_RADIUS}
                                  fill="none"
                                  stroke={accent}
                                  strokeWidth={2.5}
                                  strokeDasharray={SEASON_RING_CIRCUMFERENCE}
                                  strokeDashoffset={SEASON_RING_CIRCUMFERENCE * (1 - seasonProgressPct / 100)}
                                  style={{ transition: "stroke-dashoffset 200ms ease" }}
                                />
                              )}
                            </>
                          )}
                        </svg>
                        {allWatched && <span style={{ position: "absolute" }}><Icon name="check" size={12} color="#1a1108" strokeWidth={2.6} /></span>}
                        {skipSeasonMenuFor === season.id && (
                          <div className="absolute z-30 rounded-2xl text-left" style={{ right: 0, top: "calc(100% + 8px)", width: 220, padding: "8px", background: "rgba(28,22,16,0.97)", border: `1px solid ${t.glassBorder}`, backdropFilter: "blur(24px)", boxShadow: "0 20px 44px rgba(0,0,0,0.55)" }}>
                            <div style={{ fontSize: 10.5, color: t.textDim, fontWeight: 600, letterSpacing: "0.08em", padding: "4px 10px 6px" }}>SET WATCH STATUS</div>
                            <button onClick={(ev) => { ev.stopPropagation(); markSeasonWatched(season.id); }} className="w-full flex items-center gap-3 rounded-xl active:scale-95 transition" style={{ padding: "9px 10px" }}>
                              <Icon name="checkCircle" size={18} color={accent} />
                              <span style={{ fontSize: 13, color: "#fff", fontWeight: 500 }}>Mark season watched</span>
                            </button>
                            <button onClick={(ev) => { ev.stopPropagation(); markSeasonWithPreviousSeasons(season.id); }} className="w-full flex items-center gap-3 rounded-xl active:scale-95 transition" style={{ padding: "9px 10px" }}>
                              <Icon name="collection" size={17} color="#fff" />
                              <span style={{ fontSize: 13, color: "#fff", fontWeight: 500 }}>Previous seasons too</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {isOpen && (
                      <div className="flex flex-col gap-2.5" style={{ padding: "0 10px 10px" }}>
                        {season.episodes.map((e) => (
                          <div key={e.n} className="flex items-center gap-3 rounded-2xl" style={{ padding: "8px", background: "rgba(255,255,255,0.03)", border: `1px solid ${t.cardBorder}` }}>
                            <div onClick={() => setActiveEpisode({ seasonId: season.id, epNumber: e.n })} className="relative flex-shrink-0 cursor-pointer active:scale-95 transition" style={{ width: 106, height: 71, borderRadius: 10, overflow: "hidden" }}>
                              <PosterArt posterPath={e.posterPath} base={e.base} glow={e.glow} alt={e.title} />
                              {e.watched && e.myRating && (
                                <div className="absolute flex items-center gap-1 rounded-full" style={{ left: 6, bottom: 6, padding: "2px 6px", background: "rgba(0,0,0,0.62)" }}>
                                  <Icon name="star" size={8} color={accent} />
                                  <span style={{ fontSize: 10, fontWeight: 600, color: "#fff" }}>{e.myRating.toFixed(1)}/5</span>
                                </div>
                              )}
                            </div>
                            <div onClick={() => setActiveEpisode({ seasonId: season.id, epNumber: e.n })} className="flex-1 min-w-0 cursor-pointer">
                              <div style={{ fontSize: 10.5, fontWeight: 600, color: t.textDim, letterSpacing: "0.06em" }}>EPISODE {e.n}</div>
                              <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginTop: 1 }}>{e.title}</div>
                              <div style={{ fontSize: 11, color: t.textDim, marginTop: 2 }}>{e.date}</div>
                            </div>
                            {e.daysUntil != null ? (
                              <div className="flex-shrink-0 flex flex-col items-center justify-center" style={{ width: 44 }}>
                                {e.daysUntil === Infinity ? (
                                  <span style={{ fontSize: 10.5, fontWeight: 700, color: t.textDim, letterSpacing: "0.04em" }}>TBA</span>
                                ) : (
                                  <>
                                    <span style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>{e.daysUntil === 0 ? "•" : e.daysUntil}</span>
                                    <span style={{ fontSize: 9, color: t.textDim, letterSpacing: "0.06em", marginTop: 1 }}>{e.daysUntil === 0 ? "TODAY" : e.daysUntil === 1 ? "TOMORROW" : "DAYS"}</span>
                                  </>
                                )}
                              </div>
                            ) : (
                              <div className="relative flex-shrink-0">
                                <button onClick={() => {
                                  if (e.watched || e.skipped) { setSkipMenuFor(null); setWatchMenuFor(`${season.id}-${e.n}`); return; }
                                  toggleEp(season.id, e.n);
                                }} className="active:scale-90 transition flex items-center justify-center" style={{
                                  width: 32, height: 32, borderRadius: "50%",
                                  background: e.watched ? ((e.watchCount || 1) >= 2 ? "#7CC950" : accent) : e.skipped ? SKIPPED_GREY : "rgba(255,255,255,0.10)",
                                }}>
                                  {e.watched && (e.watchCount || 1) >= 2
                                    ? <span style={{ fontSize: 11, fontWeight: 700, color: "#0d1a06" }}>×{e.watchCount}</span>
                                    : e.skipped
                                    ? <Icon name="skip" size={13} color="#fff" />
                                    : <Icon name="check" size={14} color={e.watched ? "#1a1108" : "rgba(255,255,255,0.4)"} strokeWidth={2.4} />}
                                </button>
                                {watchMenuFor === `${season.id}-${e.n}` && (
                                  <div className="absolute z-30 rounded-2xl" style={{ right: 0, top: "calc(100% + 8px)", width: 200, padding: "8px", background: "rgba(28,22,16,0.97)", border: `1px solid ${t.glassBorder}`, backdropFilter: "blur(24px)", boxShadow: "0 20px 44px rgba(0,0,0,0.55)" }}>
                                    <div style={{ fontSize: 10.5, color: t.textDim, fontWeight: 600, letterSpacing: "0.08em", padding: "4px 10px 6px" }}>MARK AS…</div>
                                    <button onClick={() => markNotWatched(season.id, e.n)} className="w-full flex items-center gap-3 rounded-xl active:scale-95 transition" style={{ padding: "9px 10px" }}>
                                      <Icon name="eyeOff" size={15} color="#fff" />
                                      <span style={{ fontSize: 13, color: "#fff", fontWeight: 500 }}>Not Watched</span>
                                    </button>
                                    <button onClick={() => markSkipped(season.id, e.n)} className="w-full flex items-center gap-3 rounded-xl active:scale-95 transition" style={{ padding: "9px 10px" }}>
                                      <Icon name="skip" size={15} color="#fff" />
                                      <span style={{ fontSize: 13, color: "#fff", fontWeight: 500 }}>Skipped</span>
                                    </button>
                                    <button onClick={() => markRewatched(season.id, e.n, e.watchCount)} className="w-full flex items-center gap-3 rounded-xl active:scale-95 transition" style={{ padding: "9px 10px" }}>
                                      <div style={{ width: 18, height: 18, borderRadius: 5, border: "1.5px solid #fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                        <span style={{ fontSize: 9, fontWeight: 700, color: "#fff" }}>+1</span>
                                      </div>
                                      <span style={{ fontSize: 13, color: "#fff", fontWeight: 500 }}>Rewatched</span>
                                    </button>
                                    <button onClick={() => markWatchedOnce(season.id, e.n)} className="w-full flex items-center gap-3 rounded-xl active:scale-95 transition" style={{ padding: "9px 10px" }}>
                                      <div style={{ width: 18, height: 18, borderRadius: 5, border: "1.5px solid #fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                        <span style={{ fontSize: 9, fontWeight: 700, color: "#fff" }}>1</span>
                                      </div>
                                      <span style={{ fontSize: 13, color: "#fff", fontWeight: 500 }}>Watched Once</span>
                                    </button>
                                  </div>
                                )}
                                {skipMenuFor === `${season.id}-${e.n}` && (
                                  <div className="absolute z-30 rounded-2xl" style={{ right: 0, top: "calc(100% + 8px)", width: 220, padding: "8px", background: "rgba(28,22,16,0.97)", border: `1px solid ${t.glassBorder}`, backdropFilter: "blur(24px)", boxShadow: "0 20px 44px rgba(0,0,0,0.55)" }}>
                                    <div style={{ fontSize: 10.5, color: t.textDim, fontWeight: 600, letterSpacing: "0.08em", padding: "4px 10px 6px" }}>SET WATCH STATUS</div>
                                    <button onClick={() => markOnlyThis(season.id, e.n)} className="w-full flex items-center gap-3 rounded-xl active:scale-95 transition" style={{ padding: "9px 10px" }}>
                                      <Icon name="checkCircle" size={18} color={accent} />
                                      <span style={{ fontSize: 13, color: "#fff", fontWeight: 500 }}>Only for this episode</span>
                                    </button>
                                    <button onClick={() => markWithPrevious(season.id, e.n)} className="w-full flex items-center gap-3 rounded-xl active:scale-95 transition" style={{ padding: "9px 10px" }}>
                                      <Icon name="collection" size={17} color="#fff" />
                                      <span style={{ fontSize: 13, color: "#fff", fontWeight: 500 }}>Previous episodes too</span>
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              </div>
            </div>
          )}

          {/* ---------- Cast tab ---------- */}
          {tab === "cast" && (
            <div className="show-detail-panel-mobile-only">
            <SectionErrorBoundary>
              {cast.length === 0 ? (
                <div className="mt-4" style={{ padding: "24px 0", textAlign: "center", fontSize: 12.5, color: t.textDim }}>No cast or crew listed yet.</div>
              ) : (
                <>
                  <CastGallery people={cast.filter((c) => c.isCast)} onSelect={(id) => router.push(`/person/${id}`)} />
                  {(() => {
                    const crew = cast.filter((c) => !c.isCast);
                    return crew.length > 0 ? (
                      <div className="mt-6">
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: "#fff", marginBottom: 4 }}>Crew</div>
                        <CastGallery people={crew} onSelect={(id) => router.push(`/person/${id}`)} />
                      </div>
                    ) : null;
                  })()}
                </>
              )}
            </SectionErrorBoundary>
            </div>
          )}

          {/* ---------- Details tab ---------- */}
          {tab === "details" && (
            <div className="mt-4 rounded-2xl overflow-hidden show-detail-panel-mobile-only" style={{ background: t.cardFill, border: `1px solid ${t.cardBorder}` }}>
              {/* Ordered Show Status, Ratings, Genres, First Air Date,
                  Creator, Network, Where to Watch per explicit request.
                  Show Status is always rendered (unconditional), so it's
                  always the true first row — divider={false} no longer
                  needs to be conditional on some other row's presence. */}
              <DetailRow icon="episodes" label="Show Status" divider={false}>
                <span style={{ fontSize: 12.5, color: "#fff", fontWeight: 500 }}>
                  {show.seasonsCount} Season{show.seasonsCount === 1 ? "" : "s"}
                  {show.episodeCount != null && <> · {show.episodeCount} Episode{show.episodeCount === 1 ? "" : "s"}</>}
                  {show.statusLabel && <> · {show.statusLabel}</>}
                </span>
              </DetailRow>

              <DetailRow icon="star" label="Ratings">
                {show.rating ? (
                  <span style={{ fontSize: 12.5, fontWeight: 600 }}>
                    <span style={{ color: accent }}>★ {show.rating}</span>
                    <span style={{ color: t.textDim, fontWeight: 500 }}> · {Number(show.voteCount).toLocaleString()} votes</span>
                  </span>
                ) : (
                  <span style={{ fontSize: 12.5, color: t.textDim }}>—</span>
                )}
              </DetailRow>

              {show.genresList.length > 0 && (
                <DetailRow icon="layers" label="Genres">
                  <div className="flex flex-wrap gap-1.5 justify-end">
                    {show.genresList.map((g) => (
                      <span key={g} className="rounded-full" style={{ padding: "3px 10px", fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.85)", background: "rgba(255,255,255,0.08)" }}>{g}</span>
                    ))}
                  </div>
                </DetailRow>
              )}

              {show.firstAirDate && (
                <DetailRow icon="calendar" label="First Air Date">
                  <span style={{ fontSize: 12.5, color: "#fff", fontWeight: 500 }}>{show.firstAirDate}</span>
                </DetailRow>
              )}

              {show.creator !== "—" && (
                <DetailRow icon="user" label="Creator">
                  <span style={{ fontSize: 12.5, color: "#fff", fontWeight: 500 }}>{show.creator}</span>
                </DetailRow>
              )}

              {show.network !== "—" && (
                <DetailRow icon="tv" label="Network">
                  <span style={{ fontSize: 12.5, color: "#fff", fontWeight: 500 }}>{show.network}</span>
                </DetailRow>
              )}

              {/* Where to Watch — its own block rather than a plain
                  label/value row, since it can hold several provider
                  groups (Stream/Rent/Buy) plus the required JustWatch
                  attribution, not a single line of text. */}
              <div style={{ padding: "13px 16px", borderTop: `1px solid ${t.cardBorder}` }}>
                <div className="flex items-center gap-2" style={{ marginBottom: watchProviders ? 12 : 0 }}>
                  <Icon name="globe" size={14} color={t.textDim} />
                  <span style={{ fontSize: 12.5, color: t.textDim, fontWeight: 500 }}>Where to Watch</span>
                </div>
                {!watchProviders ? (
                  <span style={{ fontSize: 12, color: t.textDim }}>Not available in Thailand yet.</span>
                ) : (
                  <>
                    {watchProviders.flatrate.length > 0 && <ProviderGroup label="Stream" items={watchProviders.flatrate} />}
                    {watchProviders.rent.length > 0 && <ProviderGroup label="Rent" items={watchProviders.rent} />}
                    {watchProviders.buy.length > 0 && <ProviderGroup label="Buy" items={watchProviders.buy} />}
                    {watchProviders.link && (
                      <a href={watchProviders.link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: t.textDim, textDecoration: "underline", textUnderlineOffset: 2 }}>
                        Streaming data provided by JustWatch
                      </a>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* ---------- Reviews tab — season ratings (0-10 + mood/character/
              review), reference/season_rating_prototype.jsx. All three
              banner states (manual/auto/empty) always render, no filtering. */}
          {tab === "reviews" && (
            <div className="mt-4">
              {seasons.map((season) => (
                <SeasonBanner
                  key={season.id}
                  season={season}
                  manual={seasonRatings[season.id]}
                  auto={getAutoSeasonScore(season.episodes)}
                  backdropPath={show.backdropPath}
                  logoUrl={customLogoUrl || autoLogoUrl}
                  onClick={() => openReviewSeason(season.id)}
                />
              ))}
            </div>
          )}

          {/* ---------- Desktop Cast & Crew (between Episodes and Trailer) ---------- */}
          <section className="show-desktop-cast">
            <div className="show-desktop-cast-head">
              <h2>Cast & Crew</h2>
            </div>
            {cast.length === 0 ? (
              <div className="show-desktop-ep-empty">No cast or crew listed yet.</div>
            ) : (
              <div className="show-desktop-cast-row">
                {cast.map((c) => (
                  <button
                    key={`${c.isCast ? "cast" : "crew"}-${c.id}`}
                    type="button"
                    className="show-desktop-cast-card"
                    onClick={() => router.push(`/person/${c.id}`)}
                  >
                    <div className="show-desktop-cast-avatar" style={{ background: c.grad }}>
                      {c.profilePath ? (
                        <Image src={tmdbImage(c.profilePath, "w185")} alt="" fill sizes="88px" style={{ objectFit: "cover" }} />
                      ) : (
                        <span>{c.initials}</span>
                      )}
                    </div>
                    <div className="show-desktop-cast-name">{c.name}</div>
                    <div className="show-desktop-cast-role">{c.role}</div>
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* trailer & more — every trailer TMDB has (not just one),
              plus bonus content (teasers/featurettes/behind-the-scenes/
              clips/bloopers), as a horizontal-scroll row instead of a
              single fixed thumbnail. */}
          <div className="mt-7">
            <div className="show-detail-section-title">Trailer & More</div>
            {videos.length > 0 ? (
              <div className="flex gap-3 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
                {videos.map((v) => (
                  <button
                    key={v.key}
                    onClick={() => setOpenVideo(v)}
                    className="relative flex-shrink-0 rounded-2xl overflow-hidden block active:scale-[0.98] transition"
                    style={{ width: 242, height: 143 }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- YouTube thumbnail CDN, not TMDB; PosterArt/next-image is TMDB-only */}
                    <img src={`https://i.ytimg.com/vi/${v.key}/hqdefault.jpg`} alt={v.name || v.type} className="absolute inset-0 w-full h-full" style={{ objectFit: "cover" }} />
                    <div className="absolute inset-0 flex items-center justify-center">
                      {/* Liquid glass, not solid white — a fully opaque
                          white disc was too dominant, competing with the
                          thumbnail itself. Fill/border lightened further
                          each pass (0.16->0.10->0.085, 0.3->0.22->0.19)
                          since it kept reading as a visible blocking disc
                          over the video underneath. */}
                      <div style={{ width: 42, height: 42, borderRadius: "50%", background: "rgba(255,255,255,0.085)", border: "1px solid rgba(255,255,255,0.19)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Icon name="play" size={15} color="#fff" />
                      </div>
                    </div>
                    {/* No separate type badge (Trailer/Featurette/etc.) —
                        the video's own title text below already conveys
                        that, a second label was redundant. */}
                    <div className="absolute left-0 right-0 bottom-0 px-3 pb-2.5" style={{ background: "linear-gradient(0deg, rgba(0,0,0,0.75), transparent)" }}>
                      <span style={{ fontSize: 12, color: "#fff", fontWeight: 600, lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{v.name || v.type}</span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="w-full rounded-2xl flex items-center justify-center" style={{ height: 150, background: t.cardFill, border: `1px solid ${t.cardBorder}` }}>
                <span style={{ fontSize: 12.5, color: t.textDim }}>No videos available yet.</span>
              </div>
            )}
          </div>

          {/* similar — title + posters share the full-bleed edge padding
              so the heading aligns with the first poster, not the Trailer
              content column. */}
          <div className="mt-7 mb-2 show-similar">
            <div className="show-similar-bleed">
              <div className="show-similar-title">You May Also Like</div>
              {resolvedSimilar.length === 0 ? (
                <span className="show-similar-empty" style={{ fontSize: 12.5, color: t.textDim }}>No recommendations yet.</span>
              ) : (
                <div className="show-similar-row">
                  {resolvedSimilar.map((s) => (
                    <Link key={s.id} href={`/show/${s.id}`} className="show-similar-card">
                      <div className="show-similar-poster">
                        <div className="show-similar-poster-art">
                          <PosterArt posterPath={s.posterPath} base={s.base} glow={s.glow} alt={s.title} />
                        </div>
                        <MediaStatusBadge status={similarStatusMap[s.id]} />
                      </div>
                      <div className="show-similar-name">{s.title}</div>
                      {s.year ? <div className="show-similar-year">{s.year}</div> : null}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Deep-link cover — hides this page's own hero/episodes content
          while a ?tab=reviews visitor's real rating data is still loading
          (see deepLinkPending above), so Edit from ShareRatingCard lands
          straight on the season editor with no flash of plain Show Detail
          first. Same solid background + z-40 as SeasonRatingScreen itself,
          so the handoff between the two is visually seamless. */}
      {deepLinkPending && <div className="fixed inset-0 z-40" style={{ background: "#0A0A0C" }} />}

      {/* ---------- Unified season rating screen ---------- */}
      {reviewOpenFor != null && (() => {
        const season = seasons.find((s) => s.id === reviewOpenFor);
        const manual = seasonRatings[reviewOpenFor];
        const auto = getAutoSeasonScore(season.episodes);
        return (
          <SeasonRatingScreen
            key={reviewOpenFor}
            showId={showId}
            showTitle={displayTitle}
            season={season}
            manual={manual}
            auto={auto}
            cast={cast.filter((c) => c.isCast)}
            backdropPath={show.backdropPath}
            logoUrl={customLogoUrl || autoLogoUrl}
            showGenre={show.genres}
            showSynopsis={show.descriptionFull}
            initialEditing={reviewInitialEditing}
            onClose={() => {
              if (reviewOpenedFromProfile) { router.back(); return; }
              setReviewOpenFor(null);
            }}
            onSave={(payload) => saveSeasonRatingFor(reviewOpenFor, payload)}
            onDelete={() => deleteSeasonRatingFor(reviewOpenFor)}
            onShare={() => setShareCardFor(reviewOpenFor)}
          />
        );
      })()}

      {/* ---------- Shareable rating card ---------- */}
      {shareCardFor != null && (() => {
        const season = seasons.find((s) => s.id === shareCardFor);
        const manual = seasonRatings[shareCardFor];
        const auto = manual ? null : getAutoSeasonScore(season.episodes);
        return (
          <ShareRatingCard
            userId={user.id}
            showId={showId}
            showTitle={displayTitle}
            originalTitle={show.originalTitle}
            originalLanguage={show.originalLanguage}
            season={{ ...season, seasonNumber: season.id }}
            manual={manual}
            auto={auto}
            backdropPath={show.backdropPath}
            username={username}
            onClose={() => setShareCardFor(null)}
            onEdit={() => { setShareCardFor(null); openReviewSeason(shareCardFor); }}
          />
        );
      })()}

      {/* ---------- Episode rating sheet ---------- */}
      {ratingEpisode && (
        <EpisodeRatingFlow
          subject={{
            eyebrow: `S${ratingEpisode.seasonId} E${ratingEpisode.ep.n}`,
            title: ratingEpisode.ep.title,
            runtimeMin: ratingEpisode.ep.runtime,
            episodeAirDate: ratingEpisode.ep.date,
            posterPath: ratingEpisode.ep.posterPath,
            synopsis: ratingEpisode.ep.synopsis,
            base: ratingEpisode.ep.base,
            glow: ratingEpisode.ep.glow,
            showId,
            season: ratingEpisode.seasonId,
            episode: ratingEpisode.ep.n,
          }}
          cast={cast.filter((c) => c.isCast)}
          onClose={() => setRatingEpisode(null)}
          onSave={saveEpisodeRating}
        />
      )}

      {/* ---------- Episode quick-view overlay ----------
          Mobile: full-screen sheet. Desktop: centered liquid-glass card
          (tint + blur + soft radiance) — same EpisodeDetail content, different shell. */}
      {activeEpisode && (() => {
        const { seasonId, epNumber } = activeEpisode;
        const ep = seasons.find((s) => s.id === seasonId).episodes.find((e) => e.n === epNumber);
        return (
          <div
            className="show-ep-detail-overlay fixed inset-0 z-40"
            onClick={() => setActiveEpisode(null)}
          >
            <div className="show-ep-detail-panel" onClick={(event) => event.stopPropagation()}>
              <EpisodeDetail
                showTitle={displayTitle}
                seasonNumber={seasonId}
                episode={ep}
                cast={cast}
                hasEarlierUnwatched={hasEarlierUnwatched(seasonId, ep.n)}
                onClose={() => setActiveEpisode(null)}
                onCastClick={(id) => router.push(`/person/${id}`)}
                onMarkWatched={markWatchedFromDetail}
                onMarkOnlyThis={markOnlyThisFromDetail}
                onMarkWithPrevious={markWithPreviousFromDetail}
                onMarkNotWatched={() => markNotWatched(seasonId, ep.n)}
                onMarkSkipped={() => markSkipped(seasonId, ep.n)}
                onMarkRewatched={() => markRewatched(seasonId, ep.n, ep.watchCount)}
                onMarkWatchedOnce={() => markWatchedOnce(seasonId, ep.n)}
              />
            </div>
          </div>
        );
      })()}

      {/* ---------- Add to a Collection — mobile bottom sheet ---------- */}
      {collectionSheetOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center show-collection-sheet" style={{ background: "rgba(0,0,0,0.6)" }} onClick={() => setCollectionSheetOpen(false)}>
          <div className="w-full rounded-t-3xl flex flex-col relative" style={{ maxHeight: "76%", background: "#161210", border: `1px solid ${t.glassBorder}`, borderBottom: "none", boxShadow: "0 -20px 60px rgba(0,0,0,0.6)" }} onClick={(ev) => ev.stopPropagation()}>
            <div className="flex justify-center flex-shrink-0" style={{ paddingTop: 10 }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.25)" }} />
            </div>
            <div className="flex items-center justify-between px-5 flex-shrink-0" style={{ paddingTop: 14, paddingBottom: 4 }}>
              <button onClick={() => setCollectionSheetOpen(false)} className="rounded-full flex items-center justify-center active:scale-90 transition" style={{ width: 36, height: 36, background: "rgba(255,255,255,0.1)" }}>
                <Icon name="x" size={16} color="#fff" strokeWidth={2.6} />
              </button>
              <span style={{ fontSize: 19, fontWeight: 800, color: "#fff" }}>Collections</span>
              <div style={{ width: 36 }} />
            </div>

            <div className="overflow-y-auto" style={{ padding: "16px 20px", scrollbarWidth: "none" }}>
              <div className="flex flex-col gap-3">
                {collections.length === 0 ? (
                  <div style={{ fontSize: 12.5, color: t.textDim, textAlign: "center", padding: "24px 0" }}>No collections yet.</div>
                ) : collections.map((c) => (
                  <CollectionPickerCard key={c.id} collection={c} accent={accent} onClick={() => toggleCollection(c.id)} />
                ))}
              </div>
              <div style={{ height: 20 }} />
            </div>

            <div className="flex items-center justify-between gap-3 flex-shrink-0" style={{ padding: "12px 20px calc(16px + env(safe-area-inset-bottom))", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
              <button
                type="button"
                onClick={() => setNewCollectionOpen(true)}
                className="flex items-center gap-2 active:opacity-70 transition"
                style={{ padding: "10px 4px", color: "#fff", fontSize: 14, fontWeight: 600 }}
              >
                <Icon name="plus" size={15} color="#fff" strokeWidth={2.2} />
                Create new
              </button>
              <button
                type="button"
                disabled={!collectionConfirmActive}
                onClick={() => setCollectionSheetOpen(false)}
                className="rounded-full active:scale-95 transition"
                style={{
                  minWidth: 108,
                  padding: "11px 18px",
                  background: collectionConfirmActive ? "#fff" : "rgba(255,255,255,0.1)",
                }}
              >
                <span style={{ fontSize: 13.5, fontWeight: 700, color: collectionConfirmActive ? "#111" : "rgba(255,255,255,0.42)" }}>Confirm</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Desktop — Add to Collection (centered liquid-glass modal) */}
      {collectionAllOpen && (
        <div className="show-collection-all-scrim" onClick={() => setCollectionAllOpen(false)}>
          <div className="show-collection-all-modal" role="dialog" aria-label="Add to a collection" onClick={(ev) => ev.stopPropagation()}>
            <div className="show-collection-all-head">
              <div>
                <div className="show-collection-all-title">Collections</div>
                <div className="show-collection-all-sub">Add this show to one or more collections</div>
              </div>
              <button type="button" className="show-collection-all-close" aria-label="Close" onClick={() => setCollectionAllOpen(false)}>
                <Icon name="x" size={16} color="#fff" strokeWidth={2.2} />
              </button>
            </div>
            <div className="show-collection-all-list">
              {collections.length === 0 ? (
                <div className="show-collection-empty">No collections yet.</div>
              ) : (
                collections.map((c) => (
                  <CollectionQuickRow key={c.id} collection={c} onClick={() => toggleCollection(c.id)} />
                ))
              )}
            </div>
            <div className="show-collection-all-footer">
              <button
                type="button"
                className="show-collection-create-new"
                onClick={() => setNewCollectionOpen(true)}
              >
                <Icon name="plus" size={14} color="#fff" strokeWidth={2.2} />
                Create new
              </button>
              <button
                type="button"
                className={`show-collection-confirm${collectionConfirmActive ? " is-active" : ""}`}
                disabled={!collectionConfirmActive}
                onClick={() => setCollectionAllOpen(false)}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* create a new collection, adds the show to it immediately — sits
          above the Collections menu without collapsing it. */}
      {newCollectionOpen && (
        <div className="fixed inset-0 flex items-center justify-center px-8 show-collection-create-scrim" style={{ background: "rgba(0,0,0,0.45)", zIndex: 100 }} onClick={() => { setNewCollectionOpen(false); setNewCollectionName(""); }}>
          <div className="w-full rounded-3xl show-collection-create-modal" style={{ padding: 22, background: "rgba(255,255,255,0.14)", border: "1px solid rgba(255,255,255,0.16)", backdropFilter: "blur(40px) saturate(140%)", WebkitBackdropFilter: "blur(40px) saturate(140%)", boxShadow: "0 30px 60px rgba(0,0,0,0.55)", maxWidth: 420, position: "relative", zIndex: 110 }} onClick={(ev) => ev.stopPropagation()}>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#fff", marginBottom: 14 }}>New Collection</div>
            <input autoFocus value={newCollectionName} onChange={(ev) => setNewCollectionName(ev.target.value)} placeholder="Collection name" className="w-full rounded-2xl outline-none" style={{ padding: "13px 16px", background: t.cardFill, border: `1px solid ${t.cardBorder}`, fontSize: 14.5, color: "#fff" }} />
            <div className="flex gap-2.5" style={{ marginTop: 18 }}>
              <button onClick={() => { setNewCollectionOpen(false); setNewCollectionName(""); }} className="flex-1 rounded-full active:scale-95 transition" style={{ padding: 12, background: t.cardFill, border: `1px solid ${t.glassBorder}` }}><span style={{ fontSize: 13.5, fontWeight: 600, color: "#fff" }}>Cancel</span></button>
              <button
                onClick={createCollectionAndAdd}
                disabled={!newCollectionName.trim()}
                className="flex-1 rounded-full active:scale-95 transition"
                style={{ padding: 12, background: newCollectionName.trim() ? "#fff" : "rgba(255,255,255,0.1)" }}
              >
                <span style={{ fontSize: 13.5, fontWeight: 700, color: newCollectionName.trim() ? "#111" : "rgba(255,255,255,0.42)" }}>Create & Add</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {imagePickerType && (
        <ImagePickerScreen
          type={imagePickerType}
          showId={showId}
          currentUrl={imagePickerType === "backdrop" ? customBackdropUrl : imagePickerType === "poster" ? customPosterUrl : customLogoUrl}
          onSelect={(url) => setCustomImage(showId, imagePickerType, url)}
          onClose={() => router.replace(`/show/${showId}`)}
        />
      )}

      {/* Plays in-app instead of opening YouTube — youtube-nocookie.com is
          YouTube's own privacy-enhanced embed domain (no third-party
          cookies until playback actually starts), autoplay=1 since the
          user just tapped an explicit "play" thumbnail. */}
      {openVideo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.92)" }} onClick={() => setOpenVideo(null)}>
          <div className="absolute" style={{ top: "calc(env(safe-area-inset-top) + 12px)", right: 20, zIndex: 10 }} onClick={(e) => e.stopPropagation()}>
            <GlassButton onClick={() => setOpenVideo(null)} style={{ width: 38, height: 38 }}><Icon name="x" size={16} color={t.text} /></GlassButton>
          </div>
          <div className="w-full" style={{ aspectRatio: "16 / 9" }} onClick={(e) => e.stopPropagation()}>
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${openVideo.key}?autoplay=1&rel=0`}
              title={openVideo.name || openVideo.type}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              style={{ width: "100%", height: "100%", border: "none" }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
