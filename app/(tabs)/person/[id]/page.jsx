import PersonDetailClient from "./PersonDetailClient";
import { getPersonDetails } from "@/lib/tmdb";

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

async function getPersonData(personId) {
  const person = await getPersonDetails(personId);

  // Same shape the old /api/people/[id] route produced, minus the
  // per-caller "watched" cross-reference (this page has no show context to
  // scope that to — PersonDetailClient does its own watch-history lookup).
  const credits = (person.combined_credits?.cast ?? [])
    .filter((c) => (c.media_type === "movie" || c.media_type === "tv") && c.poster_path)
    .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
    .map((c) => ({
      id: c.id,
      title: c.media_type === "tv" ? (c.name ?? "") : (c.title ?? ""),
      // TV's original field is original_name, movie's is original_title —
      // resolveTitle (lib/languages.js) doesn't care which media type it
      // came from, just title/originalTitle/originalLanguage.
      originalTitle: (c.media_type === "tv" ? c.original_name : c.original_title) ?? null,
      originalLanguage: c.original_language ?? null,
      type: c.media_type,
      posterPath: c.poster_path,
    }));

  return {
    id: person.id,
    name: person.name ?? "",
    profilePath: person.profile_path ?? null,
    bio: person.biography || "",
    born: formatDate(person.birthday),
    died: formatDate(person.deathday),
    age: calculateAge(person.birthday, person.deathday),
    birthplace: person.place_of_birth || null,
    nationality: deriveNationality(person.place_of_birth),
    department: person.known_for_department || null,
    credits,
  };
}

export default async function Page({ params }) {
  const person = await getPersonData(params.id);
  return <PersonDetailClient person={person} />;
}
