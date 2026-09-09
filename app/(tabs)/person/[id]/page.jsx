import PersonDetailClient from "./PersonDetailClient";
import { getPersonDetails, pickBestPersonProfile, pickPersonHeroArt, buildPersonSocialLinks } from "@/lib/tmdb";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// TMDB's birthday/deathday are bare "YYYY-MM-DD" — parse the string's own
// digits directly rather than through `new Date(...)`, which would
// introduce a UTC-parsing day-shift (same fix as the Upcoming countdown
// and the old /api/people/[id] route this replaces).
function parseDateParts(dateStr) {
  if (!dateStr) return null;
  const [year, month, day] = dateStr.split("-").map(Number);
  return { year, month, day };
}

function formatDate(dateStr) {
  const parts = parseDateParts(dateStr);
  if (!parts) return null;
  return `${parts.day} ${MONTH_NAMES[parts.month - 1]} ${parts.year}`;
}

function yearFromDate(dateStr) {
  const parts = parseDateParts(dateStr);
  return parts?.year ?? null;
}

// TMDB's person object has no dedicated nationality field — place_of_birth
// is the closest thing it offers, a free-text string like "Los Angeles,
// California, USA". The trailing comma-separated segment is the country
// in the overwhelming majority of real TMDB data, so that's what this
// derives "Nationality" from rather than leaving it unavailable outright.
function deriveNationality(placeOfBirth) {
  if (!placeOfBirth) return null;
  const parts = placeOfBirth.split(",").map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : null;
}

// Age as of today, or age at death if deathday is present — not just a
// year subtraction, since that's off by one for anyone who hasn't had
// their birthday yet this year (or, for the deceased case, hadn't yet had
// it as of the death date).
function calculateAge(birthday, deathday) {
  const born = parseDateParts(birthday);
  if (!born) return null;
  const birthDate = new Date(born.year, born.month - 1, born.day);

  const died = parseDateParts(deathday);
  const endDate = died ? new Date(died.year, died.month - 1, died.day) : new Date();

  let age = endDate.getFullYear() - birthDate.getFullYear();
  const hadBirthdayYet = endDate.getMonth() > birthDate.getMonth()
    || (endDate.getMonth() === birthDate.getMonth() && endDate.getDate() >= birthDate.getDate());
  if (!hadBirthdayYet) age--;
  return age;
}

function roleLabel(department) {
  if (!department) return null;
  if (department === "Acting") return "Actor";
  if (department === "Directing") return "Director";
  if (department === "Writing") return "Writer";
  if (department === "Production") return "Producer";
  if (department === "Camera") return "Cinematographer";
  if (department === "Editing") return "Editor";
  if (department === "Sound") return "Sound";
  if (department === "Art") return "Art";
  if (department === "Costume & Make-Up") return "Costume & Make-Up";
  if (department === "Crew") return "Crew";
  if (department === "Visual Effects") return "Visual Effects";
  if (department === "Lighting") return "Lighting";
  return department;
}

// Talk-show / interview / archive "Self" credits dominate TMDB cast lists
// for recognizable actors. Treat those as non-acting for Works unless we
// later need them as a thin fallback.
function isNonActingAppearance(credit) {
  const raw = String(credit.character ?? "").trim();
  if (!raw) return true;
  const ch = raw.toLowerCase();
  if (/^(self|himself|herself)\b/.test(ch)) return true;
  if (/\b(archive footage)\b/.test(ch)) return true;
  if (/\b(self\s*[-–—:]\s*)/.test(ch)) return true;
  if (/^(host|co-host|presenter|guest|narrator|interviewee|cameo)\b/.test(ch)) return true;
  // Credit is literally the person's own name with no role (common on specials)
  if (credit._personName && ch === String(credit._personName).trim().toLowerCase()) return true;
  return false;
}

// Relevance first (vote mass + rating), popularity second, mild recency last —
// so Wonder Woman / Fast titles beat current-buzz talk shows.
function creditRelevanceScore(credit) {
  const votes = credit.vote_count ?? 0;
  const avg = credit.vote_average ?? 0;
  const pop = credit.popularity ?? 0;
  const year = credit._year ?? 0;
  const voteMass = Math.log10(votes + 10) * (avg > 0 ? avg : 5);
  const popMass = Math.log10(pop + 1) * 6;
  const landmark = votes > 8000 ? 22 : votes > 2500 ? 12 : votes > 800 ? 5 : 0;
  const recency = year >= 1990 ? ((year - 1990) / 40) * 4 : 0;
  const episodeBoost = Math.min(8, Math.log10((credit.episode_count ?? 0) + 1) * 4);
  return voteMass * 1.15 + popMass + landmark + recency + episodeBoost;
}

function buildActingCredits(person) {
  const personName = person.name ?? "";
  const raw = (person.combined_credits?.cast ?? [])
    .filter((c) => (c.media_type === "movie" || c.media_type === "tv") && c.poster_path)
    .map((c) => {
      const isTv = c.media_type === "tv";
      const dateStr = isTv ? c.first_air_date : c.release_date;
      const year = yearFromDate(dateStr);
      return {
        ...c,
        _personName: personName,
        _year: year,
        _dateStr: dateStr || "",
      };
    });

  const acting = raw.filter((c) => !isNonActingAppearance(c));
  const pool = acting.length >= 3 ? acting : raw;

  // Deduplicate repeated titles (same show/movie credited multiple times).
  const byKey = new Map();
  for (const c of pool) {
    const key = `${c.media_type}:${c.id}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, c);
      continue;
    }
    const prevEp = prev.episode_count ?? 0;
    const nextEp = c.episode_count ?? 0;
    if (nextEp > prevEp || (nextEp === prevEp && (c.popularity ?? 0) > (prev.popularity ?? 0))) {
      byKey.set(key, c);
    }
  }

  return [...byKey.values()]
    .map((c) => {
      const isTv = c.media_type === "tv";
      const year = c._year;
      const mapped = {
        id: c.id,
        title: isTv ? (c.name ?? "") : (c.title ?? ""),
        originalTitle: (isTv ? c.original_name : c.original_title) ?? null,
        originalLanguage: c.original_language ?? null,
        type: c.media_type,
        posterPath: c.poster_path,
        popularity: c.popularity ?? 0,
        voteCount: c.vote_count ?? 0,
        voteAverage: c.vote_average ?? 0,
        episodeCount: c.episode_count ?? 0,
        character: c.character ?? null,
        year,
        yearLabel: year != null ? String(year) : null,
        dateKey: c._dateStr,
      };
      mapped.relevance = creditRelevanceScore({
        vote_count: mapped.voteCount,
        vote_average: mapped.voteAverage,
        popularity: mapped.popularity,
        episode_count: mapped.episodeCount,
        _year: mapped.year,
      });
      return mapped;
    })
    .sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0));
}

async function getPersonData(personId) {
  const person = await getPersonDetails(personId);
  const profilePath = pickBestPersonProfile(person);
  const hero = pickPersonHeroArt(person);
  const credits = buildActingCredits(person);
  const socialLinks = buildPersonSocialLinks(person.external_ids, person.homepage || null);

  const movieRelevance = credits.filter((c) => c.type === "movie").slice(0, 8)
    .reduce((sum, c) => sum + (c.relevance ?? 0), 0);
  const tvRelevance = credits.filter((c) => c.type === "tv").slice(0, 8)
    .reduce((sum, c) => sum + (c.relevance ?? 0), 0);

  const alsoKnownAs = (person.also_known_as ?? [])
    .map((s) => String(s).trim())
    .filter(Boolean)
    .filter((s) => s.toLowerCase() !== String(person.name ?? "").trim().toLowerCase())
    // TMDB often includes Persian/Arabic-script transliterations (e.g. Jeon
    // Yeo-bin → "جئون یو بین") that look like a random bio language to users.
    // Keep Latin / Hangul / Kana / CJK aliases; drop Arabic-script ones unless
    // they're the only aliases left (then show nothing rather than junk).
    .filter((s) => {
      const letters = s.replace(/[\s·・‧.'’\-]/g, "");
      if (!letters) return false;
      const arabic = (letters.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g) || []).length;
      return arabic / letters.length < 0.35;
    })
    .slice(0, 4);

  // Localized display names from /person translations — kept for potential
  // future use, but resolvePersonName intentionally ignores these so a
  // Western name is never auto-swapped to Chinese/etc. just because that
  // language is readable. Native-script display uses original_name only.
  const namesByLang = {};
  for (const entry of person.translations?.translations ?? []) {
    const iso = entry?.iso_639_1;
    const localized = String(entry?.data?.name ?? "").trim();
    if (!iso || !localized) continue;
    if (!namesByLang[iso]) namesByLang[iso] = localized;
  }

  return {
    id: person.id,
    name: person.name ?? "",
    originalName: person.original_name ?? null,
    namesByLang,
    profilePath,
    heroPath: hero.path,
    heroKind: hero.kind,
    socialLinks,
    bio: person.biography || "",
    born: formatDate(person.birthday),
    died: formatDate(person.deathday),
    age: calculateAge(person.birthday, person.deathday),
    birthplace: person.place_of_birth || null,
    nationality: deriveNationality(person.place_of_birth),
    department: person.known_for_department || null,
    roleLabel: roleLabel(person.known_for_department),
    alsoKnownAs,
    defaultFilmTab: movieRelevance >= tvRelevance ? "movie" : "tv",
    credits,
  };
}

export default async function Page({ params }) {
  const person = await getPersonData(params.id);
  return <PersonDetailClient person={person} />;
}
