"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import Icon from "@/components/ui/Icon";
import PosterArt from "@/components/ui/PosterArt";
import EpisodeRatingFlow from "@/components/EpisodeRatingFlow";
import EpisodeDetail from "@/components/EpisodeDetail";
import ImagePickerScreen from "@/components/ImagePickerScreen";
import StatusMenu, { statusMenuOptions } from "@/components/StatusMenu";
import SeasonBanner from "@/components/SeasonBanner";
import SeasonRatingScreen from "@/components/SeasonRatingScreen";
import ShareRatingCard from "@/components/ShareRatingCard";
import { useAuth } from "@/lib/auth-context";
import { useShowCustomizations } from "@/lib/show-customizations-context";
import { getEpisodeWatches, addEpisodeWatches, clearEpisodeWatches, syncEpisodeWatchCount, rateLatestWatch } from "@/lib/episodeWatches";
import { getUserShow, setShowStatus, setShowFavorite, removeUserShow, setWatchlistAndClearProgress, removeImplicitLibraryRow } from "@/lib/userShows";
import { getCollections, createCollection, addShowToCollection, removeShowFromCollection } from "@/lib/collections";
import { getSeasonRatings, saveSeasonRating, deleteSeasonRating, getAutoSeasonScore } from "@/lib/seasonRatings";
import { getProfile } from "@/lib/profile";
import { tmdbImage } from "@/lib/tmdb";
import { resolveShowStatus } from "@/lib/statusResolver";
import { resolveTitle, useReadableLanguages } from "@/lib/languages";
import { themes, DEFAULT_ACCENT, collectionPalette, tintColorForShow } from "@/lib/theme";
import { useNavTint } from "@/lib/nav-tint-context";

const t = themes.dark;
const accent = DEFAULT_ACCENT;
// Season progress ring (SVG stroke, not conic-gradient — see the render
// site's comment) — fixed radius for a 24x24 circle at strokeWidth 2.5.
const SEASON_RING_RADIUS = 10;
const SEASON_RING_CIRCUMFERENCE = 2 * Math.PI * SEASON_RING_RADIUS;

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

function GlassButton({ children, onClick, style }) {
  return (
    <button onClick={onClick} style={{
      background: t.cardFill, color: "#fff",
      border: `1px solid ${t.glassBorder}`, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", ...style
    }} className="flex items-center justify-center gap-2 rounded-full active:scale-95 transition">
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
  const { getCustomBackdrop, getCustomPoster, getCustomLogo, setCustomImage } = useShowCustomizations();
  const readableLanguages = useReadableLanguages();
  // Resolved once here, per the signed-in user's Readable Languages —
  // downstream code (the hero title, the similar-shows row) just reads
  // `.title` normally.
  const displayTitle = resolveTitle(show, readableLanguages);
  const resolvedSimilar = similar.map((s) => ({ ...s, title: resolveTitle(s, readableLanguages) }));

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

  const [favorite, setFavorite] = useState(false);
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
  const [collectionSheetOpen, setCollectionSheetOpen] = useState(false);
  // Which video (trailer/teaser/featurette/etc.) is currently playing in
  // the fullscreen player below — was a plain trailerOpen boolean when
  // there was only ever one trailer to show; now there can be several
  // plus bonus content, so this holds the actual video object instead.
  const [openVideo, setOpenVideo] = useState(null);
  const [collections, setCollections] = useState([]);
  const [newCollectionOpen, setNewCollectionOpen] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");

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

  const [tab, setTab] = useState("episodes");
  const [seasons, setSeasons] = useState(initialSeasons);
  const [expandedSeason, setExpandedSeason] = useState(null);

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
  const releasedEpisodes = seasons.reduce((sum, s) => sum + s.episodes.filter((e) => e.daysUntil == null).length, 0);
  const watchedReleasedEpisodes = seasons.reduce((sum, s) => sum + s.episodes.filter((e) => e.daysUntil == null && e.watched).length, 0);
  const resolvedStatus = resolveShowStatus({ explicitStatus: status, watchedReleasedEpisodes, releasedEpisodes });

  // initialSeasons is TMDB-only (no per-user data in it) — seed real
  // watched/watchCount/rating state from Supabase once the signed-in user
  // is known. Purely a read: it seeds local state from what's already in
  // Supabase, it never writes anything back.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getEpisodeWatches(user.id, showId).then((byEpisode) => {
      if (cancelled) return;
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

  // Library status (Watchlist/Watching/.../Remove) + favorite — user_shows.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getUserShow(user.id, showId).then((row) => {
      if (cancelled || !row) return;
      setInLibrary(true);
      setStatus(row.status);
      setFavorite(row.favorite);
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
    if (!pendingStatusSync) return;
    setPendingStatusSync(false);
    if (!user) return;

    if (inLibrary && !statusExplicit && watchedReleasedEpisodes === 0) {
      setInLibrary(false);
      setStatus("watching");
      setStatusExplicit(true);
      removeImplicitLibraryRow(user.id, showId, "ShowDetailClient:episodeUnmarkedToZero").catch(console.error);
      return;
    }

    if (!inLibrary) {
      if (resolvedStatus) {
        setStatus(resolvedStatus);
        setInLibrary(true);
        setStatusExplicit(false);
        setShowStatus(user.id, showId, resolvedStatus, "ShowDetailClient:episodeMarked", { explicit: false }).catch(console.error);
      }
      return;
    }

    if (statusExplicit) return;

    if (resolvedStatus && resolvedStatus !== status) {
      setStatus(resolvedStatus);
      setShowStatus(user.id, showId, resolvedStatus, "ShowDetailClient:episodeMarked").catch(console.error);
    }
  }, [pendingStatusSync, resolvedStatus, status, user, showId, inLibrary, statusExplicit, watchedReleasedEpisodes]);

  // Collections sheet — which of the user's collections this show is
  // already in, so the "Add to a Collection" sheet reflects real state
  // instead of always starting empty.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getCollections(user.id).then((rows) => {
      if (cancelled) return;
      setCollections(rows.map((c, i) => ({
        id: c.id,
        name: c.name,
        count: c.showIds.length,
        inShow: c.showIds.includes(showId),
        ...collectionPalette[i % collectionPalette.length],
      })));
    }).catch(console.error);
    return () => { cancelled = true; };
  }, [user, showId]);

  // Every single-episode watch mutation (toggle, rewatch, mark
  // unwatched/watched-once) funnels through here — one choke point to (a)
  // require sign-in before writing and (b) mirror the change to Supabase.
  // Returns false (and redirects to /login) if there's no signed-in user.
  const setEpisodeWatchCount = (seasonId, n, count) => {
    if (!user) { router.push("/login"); return false; }
    setSeasons((ss) => ss.map((s) => s.id !== seasonId ? s : { ...s, episodes: s.episodes.map((e) => e.n === n ? { ...e, watchCount: count, watched: count > 0 } : e) }));
    syncEpisodeWatchCount(user.id, showId, seasonId, n, count).catch(console.error);
    setPendingStatusSync(true);
    return true;
  };

  const toggleEp = (seasonId, n) => {
    const season = seasons.find((s) => s.id === seasonId);
    const ep = season.episodes.find((e) => e.n === n);
    if ((ep.watchCount || 0) === 0) {
      if (!setEpisodeWatchCount(seasonId, n, 1)) return;
      setRatingEpisode({ seasonId, ep: { ...ep, watched: true, watchCount: 1 } });
    }
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

  const hasEarlierSeasonUnwatched = (seasonId) => seasons.some((s) => s.id < seasonId && s.episodes.some((e) => e.daysUntil == null && !e.watched));

  const markSeasonWatched = (seasonId) => {
    if (!user) { router.push("/login"); return; }
    const season = seasons.find((s) => s.id === seasonId);
    const newlyWatched = season.episodes.filter((e) => e.daysUntil == null && (e.watchCount || 0) === 0).map((e) => ({ seasonNumber: seasonId, episodeNumber: e.n }));
    setSeasons((ss) => ss.map((s) => s.id !== seasonId ? s : { ...s, episodes: s.episodes.map((e) => e.daysUntil != null ? e : { ...e, watched: true, watchCount: Math.max(e.watchCount || 0, 1) }) }));
    setSkipSeasonMenuFor(null);
    addEpisodeWatches(user.id, showId, newlyWatched).catch(console.error);
    setPendingStatusSync(true);
  };

  const markSeasonWithPreviousSeasons = (seasonId) => {
    if (!user) { router.push("/login"); return; }
    const newlyWatched = seasons.filter((s) => s.id <= seasonId).flatMap((s) =>
      s.episodes.filter((e) => e.daysUntil == null && (e.watchCount || 0) === 0).map((e) => ({ seasonNumber: s.id, episodeNumber: e.n }))
    );
    setSeasons((ss) => ss.map((s) => s.id <= seasonId ? { ...s, episodes: s.episodes.map((e) => e.daysUntil != null ? e : { ...e, watched: true, watchCount: Math.max(e.watchCount || 0, 1) }) } : s));
    setSkipSeasonMenuFor(null);
    addEpisodeWatches(user.id, showId, newlyWatched).catch(console.error);
    setPendingStatusSync(true);
  };

  const unmarkSeasonWatched = (seasonId) => {
    if (!user) { router.push("/login"); return; }
    const season = seasons.find((s) => s.id === seasonId);
    const toClear = season.episodes.filter((e) => e.daysUntil == null && (e.watchCount || 0) > 0).map((e) => e.n);
    setSeasons((ss) => ss.map((s) => s.id !== seasonId ? s : { ...s, episodes: s.episodes.map((e) => e.daysUntil != null ? e : { ...e, watched: false, watchCount: 0 }) }));
    Promise.all(toClear.map((n) => clearEpisodeWatches(user.id, showId, seasonId, n))).catch(console.error);
    setPendingStatusSync(true);
  };

  const markAllSeasonsWatched = () => {
    if (!user) { router.push("/login"); return; }
    const newlyWatched = seasons.flatMap((s) =>
      s.episodes.filter((e) => e.daysUntil == null && (e.watchCount || 0) === 0).map((e) => ({ seasonNumber: s.id, episodeNumber: e.n }))
    );
    setSeasons((ss) => ss.map((s) => ({
      ...s,
      episodes: s.episodes.map((e) => e.daysUntil != null ? e : { ...e, watched: true, watchCount: Math.max(e.watchCount || 0, 1) }),
    })));
    addEpisodeWatches(user.id, showId, newlyWatched).catch(console.error);
  };

  const selectStatus = (id) => {
    if (!user) { router.push("/login"); return; }
    if (id === "remove") {
      // Remove is a full reset of this show for this user, not just the
      // library row — removeUserShow (lib/userShows.js) cascades through
      // episode_watches and season_reviews before deleting the user_shows
      // row, so every piece of local state sourced from those tables has
      // to be cleared here too, not just inLibrary/favorite/status.
      // Deliberately not optimistic: local state only changes once the
      // delete has actually succeeded, so a failed delete can't leave the
      // UI claiming the show is gone while Supabase still has it (or the
      // reverse). The menu itself still closes immediately either way —
      // that's just dismissing the picker, not asserting success.
      removeUserShow(user.id, showId, "ShowDetailClient:selectStatus:remove")
        .then(() => {
          setInLibrary(false);
          setFavorite(false);
          setStatusExplicit(true);
          setSeasons((ss) => ss.map((s) => ({
            ...s,
            episodes: s.episodes.map((e) => ({ ...e, watched: false, watchCount: 0, myRating: null })),
          })));
          setWatchedShowIds((prev) => { const next = new Set(prev); next.delete(showId); return next; });
        })
        .catch((err) => {
          console.error(err);
          window.alert("Couldn't remove this show — please try again.");
        });
      setStatusOpen(false);
      return;
    }
    if (id === "watchlist" && watchedReleasedEpisodes > 0) {
      // Watchlist is definitionally zero watched episodes (see
      // lib/statusResolver.js) — landing here with progress already
      // recorded would recreate the exact contradiction this file's
      // status logic exists to prevent. Confirm before clearing rather
      // than either silently keeping the stale "10/10 watched" progress
      // under a Watchlist label, or silently discarding it unasked.
      const confirmed = window.confirm(
        `${displayTitle} has watched episodes. Moving it to Watchlist will clear its watch history — this can't be undone. Continue?`
      );
      if (!confirmed) { setStatusOpen(false); return; }
      setStatus("watchlist");
      setStatusExplicit(true);
      setSeasons((ss) => ss.map((s) => ({
        ...s,
        episodes: s.episodes.map((e) => ({ ...e, watched: false, watchCount: 0, myRating: null })),
      })));
      setWatchlistAndClearProgress(user.id, showId, "ShowDetailClient:selectStatus:watchlist-confirm").catch(console.error);
      setStatusOpen(false);
      return;
    }
    setStatus(id);
    setStatusExplicit(true);
    setShowStatus(user.id, showId, id, "ShowDetailClient:selectStatus", { explicit: true }).catch(console.error);
    // Canonical "Completed" behavior: status + every currently-aired
    // episode marked watched, in one place (see markAllSeasonsWatched) so
    // Show Detail can't drift from Explore's equivalent
    // (lib/userShows.js's markShowCompleted, used where full season data
    // isn't already loaded locally).
    if (id === "completed") markAllSeasonsWatched();
    setStatusOpen(false);
  };

  const addToLibrary = () => {
    if (!user) { router.push("/login"); return; }
    // Opens the status picker only — does NOT write anything. It used to
    // commit a real row immediately using whatever default status
    // happened to be showing ("watching"), before the user had chosen
    // anything; that's exactly the kind of write a mere click on a
    // reveal-the-options button must not cause. The actual row is only
    // created inside selectStatus, when a specific status is picked.
    setInLibrary(true);
    setStatusOpen(true);
  };

  const markWatchedFromDetail = () => {
    const { seasonId, epNumber } = activeEpisode;
    setActiveEpisode(null);
    toggleEp(seasonId, epNumber);
  };

  const markNotWatched = (seasonId, n) => { setEpisodeWatchCount(seasonId, n, 0); setWatchMenuFor(null); };
  const markWatchedOnce = (seasonId, n) => {
    if (!setEpisodeWatchCount(seasonId, n, 1)) { setWatchMenuFor(null); return; }
    setWatchMenuFor(null);
    const season = seasons.find((s) => s.id === seasonId);
    const ep = season.episodes.find((e) => e.n === n);
    setRatingEpisode({ seasonId, ep: { ...ep, watched: true, watchCount: 1 } });
  };
  const markRewatched = (seasonId, n, currentCount) => { setEpisodeWatchCount(seasonId, n, (currentCount || 1) + 1); setWatchMenuFor(null); };

  // true if any earlier, already-aired episode (this season before n, or an earlier season) is still unwatched
  const hasEarlierUnwatched = (seasonId, n) => {
    for (const s of seasons) {
      for (const e of s.episodes) {
        if (s.id === seasonId && e.n === n) return false;
        if (e.daysUntil == null && !e.watched) return true;
      }
    }
    return false;
  };

  const markOnlyThis = (seasonId, n) => { setSkipMenuFor(null); toggleEp(seasonId, n); };

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
    const isBefore = (s, e) => s.id < seasonId || (s.id === seasonId && e.n < n);
    const newlyWatched = seasons.flatMap((s) =>
      s.episodes.filter((e) => isBefore(s, e) && e.daysUntil == null && !e.watched).map((e) => ({ seasonNumber: s.id, episodeNumber: e.n }))
    );
    setSeasons((ss) => ss.map((s) => ({
      ...s,
      episodes: s.episodes.map((e) => (isBefore(s, e) && e.daysUntil == null && !e.watched ? { ...e, watched: true, watchCount: Math.max(e.watchCount || 0, 1) } : e)),
    })));
    setSkipMenuFor(null);
    if (newlyWatched.length > 0) {
      addEpisodeWatches(user.id, showId, newlyWatched).catch(console.error);
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
    setCollections((cs) => cs.map((c) => c.id !== id ? c : { ...c, inShow: !c.inShow, count: c.inShow ? Math.max(0, c.count - 1) : c.count + 1 }));
    if (target.inShow) removeShowFromCollection(id, showId).catch(console.error);
    else addShowToCollection(id, showId).catch(console.error);
  };

  const createCollectionAndAdd = () => {
    if (!user) { router.push("/login"); return; }
    const name = newCollectionName.trim();
    if (!name) return;
    const palette = collectionPalette[collections.length % collectionPalette.length];
    setNewCollectionName("");
    setNewCollectionOpen(false);
    // Waits for the real row (needs its actual id for subsequent
    // toggle/remove calls) rather than optimistically inserting a
    // Date.now()-keyed placeholder that Supabase writes would never match.
    createCollection(user.id, name)
      .then((row) => {
        setCollections((cs) => [{ id: row.id, name: row.name, count: 1, inShow: true, ...palette }, ...cs]);
        return addShowToCollection(row.id, showId);
      })
      .catch(console.error);
  };

  // Watch Next — the active season's own full aired-episode row, one
  // season at a time (the first season with an aired-but-unwatched
  // episode). ALL of that season's aired episodes stay in the row
  // permanently — marking one watched doesn't remove its card, it just
  // stops being the auto-scroll target, so it's "pushed left" out of the
  // immediately-visible area rather than disappearing.
  const watchNextSeason = seasons.find((s) => s.episodes.some((e) => e.daysUntil == null && !e.watched));
  const watchNextEpisodes = watchNextSeason ? watchNextSeason.episodes.filter((e) => e.daysUntil == null) : [];
  const watchNextRowRef = useRef(null);
  const watchedFingerprint = watchNextEpisodes.map((e) => (e.watched ? "1" : "0")).join("");
  useEffect(() => {
    const row = watchNextRowRef.current;
    if (!row) return;
    const firstUnwatchedIndex = watchNextEpisodes.findIndex((e) => !e.watched);
    if (firstUnwatchedIndex < 0) return;
    const card = row.children[firstUnwatchedIndex];
    if (!card) return;
    // Leaves part of the previous (already-watched) card peeking in from
    // the left instead of flush-aligning the next-up card to the row's
    // own edge (scrollIntoView's inline:"start" did that before) — a
    // flush align gives no visual hint that anything precedes it, reading
    // as "only the next episode exists" even though every earlier aired
    // episode is still in the row and it's fully scrollable back to them.
    // Skipped for the very first episode, which genuinely has nothing
    // before it to peek.
    const PEEK = 64;
    const target = firstUnwatchedIndex > 0 ? Math.max(0, card.offsetLeft - PEEK) : 0;
    row.scrollTo({ left: target, behavior: "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the watched fingerprint (a cheap derived string), not watchNextEpisodes' own identity, which is a new array every render
  }, [watchNextSeason?.id, watchedFingerprint]);

  return (
    <div className="min-h-dvh" style={{ background: t.bg }}>
      <div className="pb-8">

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
              {/* Fallback only — real poster art already has the title
                  baked in, so this would otherwise double up on top of it. */}
              {!show.posterPath && !customPosterUrl && (
                <div className="absolute inset-0 flex items-end justify-center" style={{ paddingBottom: 12 }}>
                  <span style={{ fontSize: 16, fontWeight: 800, color: "#f4ead9", letterSpacing: "0.25em" }}>{displayTitle.toUpperCase()}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="px-6" style={{ marginTop: 8, position: "relative", zIndex: 20 }}>
          {/* short description / tagline — right below the poster/hero,
              ahead of the title, with its own bottom margin so it doesn't
              crowd into the logo/title that follows. */}
          {show.tagline && (
            <div className="text-center" style={{ fontSize: 13, fontStyle: "italic", color: t.textDim, marginBottom: 18 }}>
              {show.tagline}
            </div>
          )}
          {/* native title — the user's manually-picked logo art wins when
              set; otherwise this defaults to TMDB's own logo art (matched
              to Readable Languages — see autoLogoUrl above) rather than
              plain text, since most shows really do have real logo art
              available. Plain text is the last-resort fallback, only for
              shows TMDB has no logo art for at all, or where the image
              itself fails to load. */}
          {customLogoUrl || autoLogoUrl ? (
            <div className="flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element -- a resolved TMDB CDN URL, not a next/image-managed path */}
              {/* maxHeight started at the plain-text title's own rendered
                  height (fontSize 30 * ~1.25 line-height ≈ 38px), bumped
                  30% for wide wordmarks, then bumped again here — a
                  squarish/stacked logo (common for CJK titles) is
                  height-constrained rather than width-constrained, and at
                  49 it rendered as a tiny sliver that reads as off-center/
                  adrift rather than a deliberately-sized title. Wide
                  wordmarks are unaffected either way, since maxWidth
                  governs those first. maxWidth is just a safety cap so an
                  unusually wide logo can't overflow the content column. */}
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
          {/* basic info */}
          <div className="text-center" style={{ fontSize: 12, color: t.textDim, marginTop: 9 }}>{show.yearsRange} · {show.genres} · ★ {show.rating}</div>

          {/* status */}
          <div className="flex items-center justify-center gap-2.5" style={{ marginTop: 17 }}>
            {!inLibrary ? (
              <button onClick={addToLibrary} className="flex items-center gap-2 rounded-full active:scale-95 transition" style={{ padding: "10px 20px", background: "#fff", color: "#111" }}>
                <Icon name="plus" size={14} color="#111" />
                <span style={{ fontSize: 13.5, fontWeight: 600 }}>Add to Library</span>
              </button>
            ) : (
              <>
                <div className="relative">
                  {/* Always the resolved status, never the raw stored one —
                      this button (and StatusMenu's active-option
                      highlight) must never disagree with the season
                      progress rendered in the Episodes tab below. */}
                  {statusOpen && (
                    <>
                      {/* Click-outside catcher — without this, the menu only
                          closed by tapping the trigger again or picking an
                          option; tapping anywhere else on the screen did
                          nothing, matching the reported "sometimes I'm not
                          selecting anything" bug. Same z-20/z-30 pattern
                          already used for this screen's own "more options"
                          menu (Icon name="more" button) below. */}
                      <div className="fixed inset-0 z-20" onClick={() => setStatusOpen(false)} />
                      <StatusMenu status={resolvedStatus} onSelect={selectStatus} align="center" />
                    </>
                  )}
                  {/* resolvedStatus can now genuinely be null right after
                      "Add to Library" (nothing picked yet, no watch
                      history) — falls back to a neutral "Choose Status"
                      label/icon instead of statusMenuOptions.find(...)
                      quietly returning undefined for both. */}
                  <button onClick={() => setStatusOpen((v) => !v)} className="flex items-center gap-2 rounded-full active:scale-95 transition" style={{ padding: "10px 18px", background: "#fff", color: "#111" }}>
                    <Icon name={resolvedStatus === "watchlist" ? "bookmarkFilled" : statusMenuOptions.find((s) => s.id === resolvedStatus)?.icon ?? "plus"} size={15} color="#111" />
                    <span style={{ fontSize: 13.5, fontWeight: 600 }}>{statusMenuOptions.find((s) => s.id === resolvedStatus)?.label ?? "Choose Status"}</span>
                  </button>
                </div>
                <GlassButton onClick={() => {
                  if (!user) { router.push("/login"); return; }
                  const next = !favorite;
                  setFavorite(next);
                  setShowFavorite(user.id, showId, next, "ShowDetailClient:toggleFavorite").catch(console.error);
                }} style={{ width: 40, height: 40 }}>
                  <Icon name={favorite ? "heart" : "heartOutline"} size={16} color={favorite ? "#e0567a" : "#fff"} />
                </GlassButton>
              </>
            )}
          </div>

          {/* description */}
          <div className="mt-4" style={{ fontSize: 13, lineHeight: 1.5, color: "rgba(255,255,255,0.72)" }}>
            {show.descriptionFull}
          </div>

          {/* tabs */}
          <div className="mt-5 flex gap-5" style={{ borderBottom: `1px solid ${t.cardBorder}` }}>
            {[{ id: "episodes", label: "Episodes" }, { id: "cast", label: "Cast & Crew" }, { id: "details", label: "Details" }, { id: "reviews", label: "My Rating" }].map((tb) => (
              <button key={tb.id} onClick={() => setTab(tb.id)} className="pb-2.5" style={{
                fontSize: 13.5, fontWeight: 600, color: tab === tb.id ? "#fff" : t.textDim,
                borderBottom: tab === tb.id ? `2px solid ${accent}` : "2px solid transparent",
              }}>{tb.label}</button>
            ))}
          </div>

          {/* ---------- Episodes tab ---------- */}
          {tab === "episodes" && (
            <div className="mt-4 flex flex-col gap-3">
              {/* Watch Next — the active season's own full aired-episode
                  row (see watchNextSeason/watchNextEpisodes above), one
                  season at a time. Every aired episode stays in the row
                  permanently, even once watched — marking one just auto-
                  scrolls the row so the next unwatched card becomes the
                  leading visible one, "pushing" the completed card left
                  out of view rather than removing it. Tapping the ring
                  runs the exact same mark-watched → rating-flow path as
                  the accordion below (toggleEp). Ring style matches the
                  season accordion's own progress indicator: a plain empty
                  outline when not yet watched (no icon at all), filled
                  amber with a checkmark once it is. */}
              {watchNextSeason && watchNextEpisodes.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span style={{ fontSize: 17, fontWeight: 700, color: "#fff" }}>Watch Next</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: t.textDim }}>{watchNextSeason.title}</span>
                  </div>
                  <div ref={watchNextRowRef} className="flex gap-3 overflow-x-auto" style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}>
                    {watchNextEpisodes.map((e) => (
                      <div
                        key={e.n}
                        onClick={() => setActiveEpisode({ seasonId: watchNextSeason.id, epNumber: e.n })}
                        className="relative flex-shrink-0 rounded-2xl overflow-hidden cursor-pointer active:scale-[0.98] transition"
                        style={{ width: 220, height: 130 }}
                      >
                        <PosterArt posterPath={e.posterPath} base={e.base} glow={e.glow} alt={e.title} />
                        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(0deg, rgba(0,0,0,0.75) 0%, transparent 55%)" }} />
                        <div className="absolute left-0 right-0 bottom-0 px-3 pb-2.5">
                          <div style={{ fontSize: 10.5, fontWeight: 600, color: "rgba(255,255,255,0.7)", letterSpacing: "0.06em" }}>EPISODE {e.n}</div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginTop: 1 }}>{e.title}</div>
                        </div>
                        <div className="absolute" style={{ right: 10, bottom: 10 }}>
                          {/* Same watchMenuFor/skipMenuFor state and "seasonId-n"
                              key the episode accordion below already uses —
                              tapping an already-watched episode here now opens
                              the identical "Mark As…" popup (Not Watched /
                              Rewatched / Watched Once) instead of just
                              toggling it off directly, so undoing a watch from
                              this row behaves the same as everywhere else. */}
                          <button
                            onClick={(ev) => {
                              ev.stopPropagation();
                              const rect = ev.currentTarget.getBoundingClientRect();
                              if (e.watched) { setSkipMenuFor(null); setWatchMenuFor(`${watchNextSeason.id}-${e.n}`); setWatchNextMenuAnchor({ rect, seasonId: watchNextSeason.id, epNumber: e.n, watchCount: e.watchCount }); return; }
                              if (hasEarlierUnwatched(watchNextSeason.id, e.n)) { setWatchMenuFor(null); setSkipMenuFor(`${watchNextSeason.id}-${e.n}`); setWatchNextMenuAnchor({ rect, seasonId: watchNextSeason.id, epNumber: e.n }); return; }
                              toggleEp(watchNextSeason.id, e.n);
                            }}
                            className="active:scale-90 transition flex items-center justify-center"
                            style={{ width: 32, height: 32, borderRadius: "50%", background: e.watched ? ((e.watchCount || 1) >= 2 ? "#7CC950" : accent) : "rgba(255,255,255,0.10)" }}
                          >
                            {e.watched && (e.watchCount || 1) >= 2
                              ? <span style={{ fontSize: 11, fontWeight: 700, color: "#0d1a06" }}>×{e.watchCount}</span>
                              : <Icon name="check" size={14} color={e.watched ? "#1a1108" : "rgba(255,255,255,0.4)"} strokeWidth={2.4} />}
                          </button>
                        </div>
                      </div>
                    ))}
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
                const width = isMarkAs ? 200 : 220;
                const estHeight = isMarkAs ? 160 : 110;
                const fitsBelow = window.innerHeight - rect.bottom >= estHeight + 8;
                const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
                const positionStyle = fitsBelow ? { top: rect.bottom + 8 } : { bottom: window.innerHeight - rect.top + 8 };
                return (
                  <div className="fixed inset-0 z-30" onClick={() => { setWatchMenuFor(null); setSkipMenuFor(null); }}>
                    <div
                      className="fixed rounded-2xl"
                      style={{ left, width, padding: "8px", background: "rgba(28,22,16,0.97)", border: `1px solid ${t.glassBorder}`, backdropFilter: "blur(24px)", boxShadow: "0 20px 44px rgba(0,0,0,0.55)", ...positionStyle }}
                      onClick={(ev) => ev.stopPropagation()}
                    >
                      {isMarkAs ? (
                        <>
                          <div style={{ fontSize: 10.5, color: t.textDim, fontWeight: 600, letterSpacing: "0.08em", padding: "4px 10px 6px" }}>MARK AS…</div>
                          <button onClick={() => markNotWatched(seasonId, epNumber)} className="w-full flex items-center gap-3 rounded-xl active:scale-95 transition" style={{ padding: "9px 10px" }}>
                            <Icon name="eyeOff" size={15} color="#fff" />
                            <span style={{ fontSize: 13, color: "#fff", fontWeight: 500 }}>Not Watched</span>
                          </button>
                          <button onClick={() => markRewatched(seasonId, epNumber, watchCount)} className="w-full flex items-center gap-3 rounded-xl active:scale-95 transition" style={{ padding: "9px 10px" }}>
                            <div style={{ width: 18, height: 18, borderRadius: 5, border: "1.5px solid #fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <span style={{ fontSize: 9, fontWeight: 700, color: "#fff" }}>+1</span>
                            </div>
                            <span style={{ fontSize: 13, color: "#fff", fontWeight: 500 }}>Rewatched</span>
                          </button>
                          <button onClick={() => markWatchedOnce(seasonId, epNumber)} className="w-full flex items-center gap-3 rounded-xl active:scale-95 transition" style={{ padding: "9px 10px" }}>
                            <div style={{ width: 18, height: 18, borderRadius: 5, border: "1.5px solid #fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <span style={{ fontSize: 9, fontWeight: 700, color: "#fff" }}>1</span>
                            </div>
                            <span style={{ fontSize: 13, color: "#fff", fontWeight: 500 }}>Watched Once</span>
                          </button>
                        </>
                      ) : (
                        <>
                          <div style={{ fontSize: 10.5, color: t.textDim, fontWeight: 600, letterSpacing: "0.08em", padding: "4px 10px 6px" }}>SET WATCH STATUS</div>
                          <button onClick={() => markOnlyThis(seasonId, epNumber)} className="w-full flex items-center gap-3 rounded-xl active:scale-95 transition" style={{ padding: "9px 10px" }}>
                            <Icon name="checkCircle" size={18} color={accent} />
                            <span style={{ fontSize: 13, color: "#fff", fontWeight: 500 }}>Only for this episode</span>
                          </button>
                          <button onClick={() => markWithPrevious(seasonId, epNumber)} className="w-full flex items-center gap-3 rounded-xl active:scale-95 transition" style={{ padding: "9px 10px" }}>
                            <Icon name="collection" size={17} color="#fff" />
                            <span style={{ fontSize: 13, color: "#fff", fontWeight: 500 }}>Previous episodes too</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })()}

              {seasons.map((season) => {
                const watchedCount = season.episodes.filter((e) => e.watched).length;
                const total = season.episodes.length;
                const airedTotal = season.episodes.filter((e) => e.daysUntil == null).length;
                const allWatched = airedTotal > 0 && watchedCount === airedTotal;
                // Same airedTotal denominator as allWatched, so the pie
                // reaches a full circle at exactly the same point allWatched
                // flips true — not a separate, possibly-disagreeing measure.
                const seasonProgressPct = airedTotal > 0 ? Math.round((watchedCount / airedTotal) * 100) : 0;
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
                                <div className="absolute flex items-center gap-1 rounded-full" style={{ left: 5, bottom: 5, padding: "2px 6px", background: "rgba(0,0,0,0.55)" }}>
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
                                <span style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>{e.daysUntil === 0 ? "•" : e.daysUntil}</span>
                                <span style={{ fontSize: 9, color: t.textDim, letterSpacing: "0.06em", marginTop: 1 }}>{e.daysUntil === 0 ? "TODAY" : e.daysUntil === 1 ? "TOMORROW" : "DAYS"}</span>
                              </div>
                            ) : (
                              <div className="relative flex-shrink-0">
                                <button onClick={() => {
                                  if (e.watched) { setSkipMenuFor(null); setWatchMenuFor(`${season.id}-${e.n}`); return; }
                                  if (hasEarlierUnwatched(season.id, e.n)) { setWatchMenuFor(null); setSkipMenuFor(`${season.id}-${e.n}`); return; }
                                  toggleEp(season.id, e.n);
                                }} className="active:scale-90 transition flex items-center justify-center" style={{
                                  width: 32, height: 32, borderRadius: "50%",
                                  background: e.watched ? ((e.watchCount || 1) >= 2 ? "#7CC950" : accent) : "rgba(255,255,255,0.10)",
                                }}>
                                  {e.watched && (e.watchCount || 1) >= 2
                                    ? <span style={{ fontSize: 11, fontWeight: 700, color: "#0d1a06" }}>×{e.watchCount}</span>
                                    : <Icon name="check" size={14} color={e.watched ? "#1a1108" : "rgba(255,255,255,0.4)"} strokeWidth={2.4} />}
                                </button>
                                {watchMenuFor === `${season.id}-${e.n}` && (
                                  <div className="absolute z-30 rounded-2xl" style={{ right: 0, top: "calc(100% + 8px)", width: 200, padding: "8px", background: "rgba(28,22,16,0.97)", border: `1px solid ${t.glassBorder}`, backdropFilter: "blur(24px)", boxShadow: "0 20px 44px rgba(0,0,0,0.55)" }}>
                                    <div style={{ fontSize: 10.5, color: t.textDim, fontWeight: 600, letterSpacing: "0.08em", padding: "4px 10px 6px" }}>MARK AS…</div>
                                    <button onClick={() => markNotWatched(season.id, e.n)} className="w-full flex items-center gap-3 rounded-xl active:scale-95 transition" style={{ padding: "9px 10px" }}>
                                      <Icon name="eyeOff" size={15} color="#fff" />
                                      <span style={{ fontSize: 13, color: "#fff", fontWeight: 500 }}>Not Watched</span>
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
          )}

          {/* ---------- Cast tab ---------- */}
          {tab === "cast" && (
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
          )}

          {/* ---------- Details tab ---------- */}
          {tab === "details" && (
            <div className="mt-4 rounded-2xl overflow-hidden" style={{ background: t.cardFill, border: `1px solid ${t.cardBorder}` }}>
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

          {/* trailer & more — every trailer TMDB has (not just one),
              plus bonus content (teasers/featurettes/behind-the-scenes/
              clips/bloopers), as a horizontal-scroll row instead of a
              single fixed thumbnail. */}
          <div className="mt-7">
            <div style={{ fontSize: 15, fontWeight: 600, color: "#fff", marginBottom: 10 }}>Trailer & More</div>
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

          {/* similar */}
          <div className="mt-7 mb-2">
            <div style={{ fontSize: 15, fontWeight: 600, color: "#fff", marginBottom: 10 }}>You May Also Like</div>
            {resolvedSimilar.length === 0 ? (
              <span style={{ fontSize: 12.5, color: t.textDim }}>No recommendations yet.</span>
            ) : (
              <div className="flex gap-3 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
                {resolvedSimilar.map((s) => (
                  <Link key={s.id} href={`/show/${s.id}`} className="flex-shrink-0 block" style={{ width: 100 }}>
                    <div className="relative rounded-2xl overflow-hidden" style={{ width: 100, height: 140 }}>
                      <PosterArt posterPath={s.posterPath} base={s.base} glow={s.glow} alt={s.title} />
                    </div>
                    <div style={{ fontSize: 11.5, color: "#fff", marginTop: 6, fontWeight: 500 }}>{s.title}</div>
                  </Link>
                ))}
              </div>
            )}
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
          An in-context peek (synopsis, cast, watch toggle) without leaving
          this screen — same shared EpisodeDetail component the standalone
          /show/[id]/episode/[season]/[ep] page (Home's Continue Watching
          hero opens that one) renders; this call site just wraps it in a
          fixed overlay instead of a full page and wires the callbacks to
          this component's own local season/episode state. */}
      {activeEpisode && (() => {
        const { seasonId, epNumber } = activeEpisode;
        const ep = seasons.find((s) => s.id === seasonId).episodes.find((e) => e.n === epNumber);
        return (
          <div className="fixed inset-0 z-40" style={{ background: t.bg }}>
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
              onMarkRewatched={() => markRewatched(seasonId, ep.n, ep.watchCount)}
              onMarkWatchedOnce={() => markWatchedOnce(seasonId, ep.n)}
            />
          </div>
        );
      })()}

      {/* ---------- Add to a Collection — bottom sheet ---------- */}
      {collectionSheetOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(0,0,0,0.6)" }} onClick={() => setCollectionSheetOpen(false)}>
          <div className="w-full rounded-t-3xl flex flex-col" style={{ maxHeight: "76%", background: "#161210", border: `1px solid ${t.glassBorder}`, borderBottom: "none", boxShadow: "0 -20px 60px rgba(0,0,0,0.6)" }} onClick={(ev) => ev.stopPropagation()}>
            <div className="flex justify-center flex-shrink-0" style={{ paddingTop: 10 }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.25)" }} />
            </div>
            <div className="flex items-center justify-between px-5 flex-shrink-0" style={{ paddingTop: 14, paddingBottom: 4 }}>
              <button onClick={() => setCollectionSheetOpen(false)} className="rounded-full flex items-center justify-center active:scale-90 transition" style={{ width: 36, height: 36, background: accent }}>
                <Icon name="x" size={16} color="#1a1108" strokeWidth={2.6} />
              </button>
              <span style={{ fontSize: 19, fontWeight: 800, color: "#fff" }}>Collections</span>
              <button onClick={() => setCollectionSheetOpen(false)} className="rounded-full flex items-center justify-center active:scale-90 transition" style={{ width: 36, height: 36, background: accent }}>
                <Icon name="check" size={17} color="#1a1108" strokeWidth={2.8} />
              </button>
            </div>

            <div className="overflow-y-auto" style={{ padding: "16px 20px", scrollbarWidth: "none" }}>
              <div className="flex flex-col gap-3">
                {collections.length === 0 ? (
                  <div style={{ fontSize: 12.5, color: t.textDim, textAlign: "center", padding: "24px 0" }}>No collections yet.</div>
                ) : collections.map((c) => (
                  <button key={c.id} onClick={() => toggleCollection(c.id)} className="relative w-full rounded-2xl overflow-hidden active:scale-[0.98] transition text-left flex-shrink-0" style={{ height: 88 }}>
                    <div style={{ position: "absolute", inset: 0, background: `linear-gradient(120deg, ${c.c1}40 0%, ${c.c2} 55%, ${c.c1}22 100%)` }} />
                    <div className="absolute inset-0" style={{ background: "linear-gradient(0deg, rgba(0,0,0,0.35) 0%, transparent 60%)" }} />
                    <div className="absolute left-4" style={{ bottom: 12 }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>{c.name}</div>
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginTop: 2 }}>{c.count} title{c.count === 1 ? "" : "s"}</div>
                    </div>
                    <div className="absolute flex items-center justify-center rounded-full" style={{ top: 12, right: 12, width: 26, height: 26, background: c.inShow ? accent : "rgba(0,0,0,0.45)", border: c.inShow ? "none" : "1.5px solid rgba(255,255,255,0.5)" }}>
                      {c.inShow && <Icon name="check" size={13} color="#1a1108" strokeWidth={2.8} />}
                    </div>
                  </button>
                ))}
              </div>
              <div style={{ height: 76 }} />
            </div>

            <button onClick={() => setNewCollectionOpen(true)} className="absolute rounded-full flex items-center justify-center active:scale-90 transition" style={{ bottom: 20, right: 20, width: 52, height: 52, background: accent, boxShadow: "0 10px 24px rgba(232,162,76,0.4)" }}>
              <Icon name="plus" size={22} color="#1a1108" strokeWidth={2.4} />
            </button>
          </div>
        </div>
      )}

      {/* create a new collection, adds the show to it immediately */}
      {newCollectionOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-8" style={{ background: "rgba(0,0,0,0.65)" }} onClick={() => setNewCollectionOpen(false)}>
          <div className="w-full rounded-3xl" style={{ padding: 22, background: "#1a1512", border: `1px solid ${t.glassBorder}`, boxShadow: "0 30px 60px rgba(0,0,0,0.6)" }} onClick={(ev) => ev.stopPropagation()}>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#fff", marginBottom: 14 }}>New Collection</div>
            <input autoFocus value={newCollectionName} onChange={(ev) => setNewCollectionName(ev.target.value)} placeholder="Collection name" className="w-full rounded-2xl outline-none" style={{ padding: "13px 16px", background: t.cardFill, border: `1px solid ${t.cardBorder}`, fontSize: 14.5, color: "#fff" }} />
            <div className="flex gap-2.5" style={{ marginTop: 18 }}>
              <button onClick={() => { setNewCollectionOpen(false); setNewCollectionName(""); }} className="flex-1 rounded-full active:scale-95 transition" style={{ padding: 12, background: t.cardFill, border: `1px solid ${t.glassBorder}` }}><span style={{ fontSize: 13.5, fontWeight: 600, color: "#fff" }}>Cancel</span></button>
              <button onClick={createCollectionAndAdd} disabled={!newCollectionName.trim()} className="flex-1 rounded-full active:scale-95 transition" style={{ padding: 12, background: newCollectionName.trim() ? accent : t.cardFill }}><span style={{ fontSize: 13.5, fontWeight: 700, color: newCollectionName.trim() ? "#1a1108" : t.textDim }}>Create & Add</span></button>
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
