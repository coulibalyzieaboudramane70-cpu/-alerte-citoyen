// lib/matching.ts
// Algorithmes de rapprochement automatique entre alertes.
//
// Objectif : quand une alerte "personne disparue" est créée, on calcule un
// score de similarité avec les alertes existantes (ex. avis de recherche,
// signalements) pour suggérer aux modérateurs des correspondances possibles.
// Rien n'est jamais publié/confirmé automatiquement : ce sont des SUGGESTIONS
// qu'un modérateur humain doit valider (voir app/api/alerts/[id]/matches).

export type MatchableAlert = {
  id: string;
  type: string;
  personName: string | null;
  personAge: number | null;
  personSex: string | null;
  city: string | null;
  region: string | null;
  lat: number | null;
  lng: number | null;
  dateOccurred: Date | null;
  description: string;
};

export function levenshtein(a: string, b: string): number {
  const s = a.toLowerCase().trim();
  const t = b.toLowerCase().trim();
  const m = s.length, n = t.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,        // deletion
        curr[j - 1] + 1,    // insertion
        prev[j - 1] + cost  // substitution
      );
    }
    // copy curr into prev for next iteration
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
    curr = new Array<number>(n + 1);
  }
  return prev[n];
}

function normalizeName(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // remove diacritics
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function nameSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const dist = levenshtein(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 0;
  return Math.max(0, 1 - dist / maxLen);
}

function haversineKm(lat1: number | null, lon1: number | null, lat2: number | null, lon2: number | null): number | null {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371; // km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function daysDiff(d1: Date | null, d2: Date | null): number | null {
  if (!d1 || !d2) return null;
  const diffMs = Math.abs(d1.getTime() - d2.getTime());
  return Math.round(diffMs / 86400000);
}

export type MatchResult = {
  targetId: string;
  score: number;
  nameScore: number;
  distanceKm: number | null;
  dateDeltaDays: number | null;
};

/**
 * rankMatches - calcule un score de similarité entre une alerte source et une liste de candidats.
 * Les poids sont heuristiques : ajustez si nécessaire.
 */
export function rankMatches(source: MatchableAlert, candidates: MatchableAlert[]): MatchResult[] {
  const results: MatchResult[] = [];

  for (const c of candidates) {
    // name similarity (0..1)
    const nameScore = nameSimilarity(source.personName, c.personName);

    // location score (0..1) basé sur distance (plus proche -> score plus élevé)
    const distanceKm = haversineKm(source.lat, source.lng, c.lat, c.lng);
    let locationScore = 0.5; // valeur neutre quand aucune position
    if (distanceKm != null) {
      // 0 km => 1.0, 50 km => ~0.75, 200 km => ~0
      locationScore = Math.max(0, 1 - distanceKm / 200);
    }

    // date score (0..1) : plus proche dans le temps -> 1
    const deltaDays = daysDiff(source.dateOccurred, c.dateOccurred);
    let dateScore = 0.5;
    if (deltaDays != null) {
      if (deltaDays <= 1) dateScore = 1;
      else if (deltaDays >= 60) dateScore = 0;
      else dateScore = Math.max(0, 1 - deltaDays / 60);
    }

    // sex / age heuristics
    let sexScore = 0.5;
    if (source.personSex && c.personSex) {
      sexScore = source.personSex === c.personSex ? 1 : 0.2;
    }
    let ageScore = 0.5;
    if (source.personAge != null && c.personAge != null) {
      const diff = Math.abs(source.personAge - c.personAge);
      ageScore = diff <= 3 ? 1 : diff <= 10 ? 0.6 : 0.3;
    }

    // Compose a final weighted score (weights can be tuned)
    const score =
      nameScore * 0.45 +
      locationScore * 0.25 +
      dateScore * 0.12 +
      sexScore * 0.08 +
      ageScore * 0.1;

    results.push({
      targetId: c.id,
      score: Math.round(score * 10000) / 10000,
      nameScore: Math.round(nameScore * 10000) / 10000,
      distanceKm: distanceKm != null ? Math.round(distanceKm * 100) / 100 : null,
      dateDeltaDays: deltaDays,
    });
  }

  // trier par score décroissant
  results.sort((a, b) => b.score - a.score);
  return results;
}
