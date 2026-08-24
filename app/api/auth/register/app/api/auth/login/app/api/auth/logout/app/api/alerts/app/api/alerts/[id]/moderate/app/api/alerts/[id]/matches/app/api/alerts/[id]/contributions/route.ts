import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {getCurrentUser} from "@/lib/auth";
import {contributionSchema} from "@/lib/validation";
import {rateLimit, RATE_LIMITS} from "@/lib/rateLimit";
import {contributionTrustScore, pointsForEvent} from "@/lib/points";

export async function POST(req: Request, {params}: {params: Promise<{id: string}>}) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({error: "Connexion requise."}, {status: 401});

  const {id} = await params;
  const alert = await db.alert.findUnique({where: {id}});
  if (!alert || alert.status !== "ACTIVE") {
    return NextResponse.json({error: "Alerte introuvable ou non active."}, {status: 404});
  }

  const rl = rateLimit(`contribution:${u.id}`, RATE_LIMITS.contribution.limit, RATE_LIMITS.contribution.windowMs);
  if (!rl.allowed) {
    return NextResponse.json(
      {error: "Trop de contributions récentes. Réessayez plus tard."},
      {status: 429, headers: {"Retry-After": Math.ceil(rl.retryAfterMs / 1000).toString()}}
    );
  }

  let body;
  try {
    body = contributionSchema.parse(await req.json());
  } catch {
    return NextResponse.json({error: "Contribution invalide."}, {status: 400});
  }

  const [priorCount] = await Promise.all([
    db.contribution.count({where: {alertId: id, userId: u.id}}),
  ]);
  const trust = contributionTrustScore({
    accountAgeHours: (Date.now() - u.createdAt.getTime()) / 3600000,
    priorContributionsOnAlert: priorCount,
    messageLength: body.message.length,
  });

  const [contribution] = await db.$transaction([
    db.contribution.create({data: {alertId: id, userId: u.id, message: body.message}}),
    db.user.update({
      where: {id: u.id},
      data: {points: {increment: pointsForEvent("CONTRIBUTION_SUBMITTED")}},
    }),
  ]);

  return NextResponse.json({ok: true, id: contribution.id, trustScore: trust});
}
