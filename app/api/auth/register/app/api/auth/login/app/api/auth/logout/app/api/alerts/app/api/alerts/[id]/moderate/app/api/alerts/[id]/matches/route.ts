import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {getCurrentUser} from "@/lib/auth";
import {rankMatches} from "@/lib/matching";

export async function GET(req: Request, {params}: {params: Promise<{id: string}>}) {
  const u = await getCurrentUser();
  if (!u || (u.role !== "MODERATOR" && u.role !== "ADMIN")) {
    return NextResponse.json({error: "Accès réservé à la modération."}, {status: 403});
  }

  const {id} = await params;
  const source = await db.alert.findUnique({where: {id}});
  if (!source) return NextResponse.json({error: "Alerte introuvable."}, {status: 404});

  const candidates = await db.alert.findMany({
    where: {
      id: {not: id},
      type: "MISSING_PERSON",
      status: {in: ["ACTIVE", "PENDING"]},
      personName: {not: null},
    },
    take: 500,
  });

  const results = rankMatches(source, candidates);

  for (const r of results.slice(0, 20)) {
    await db.matchSuggestion.upsert({
      where: {sourceAlertId_targetAlertId: {sourceAlertId: id, targetAlertId: r.targetId}},
      update: {score: r.score, nameScore: r.nameScore, distanceKm: r.distanceKm, dateDeltaDays: r.dateDeltaDays},
      create: {
        sourceAlertId: id,
        targetAlertId: r.targetId,
        score: r.score,
        nameScore: r.nameScore,
        distanceKm: r.distanceKm,
        dateDeltaDays: r.dateDeltaDays,
      },
    });
  }

  const candidateMap = new Map(candidates.map((c) => [c.id, c]));
  return NextResponse.json({
