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

  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j
