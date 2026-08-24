import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {getCurrentUser} from "@/lib/auth";
import {moderationSchema} from "@/lib/validation";
import {pointsForEvent} from "@/lib/points";

export async function POST(req: Request, {params}: {params: Promise<{id: string}>}) {
  const u = await getCurrentUser();
  if (!u || (u.role !== "MODERATOR" && u.role !== "ADMIN")) {
    return NextResponse.json({error: "Accès réservé à la modération."}, {status: 403});
  }

  const {id} = await params;
  const alert = await db.alert.findUnique({where: {id}});
  if (!alert) return NextResponse.json({error: "Alerte introuvable."}, {status: 404});
  if (alert.status !== "PENDING") {
    return NextResponse.json({error: "Cette alerte a déjà été traitée."}, {status: 409});
  }

  let body;
  try {
    body = moderationSchema.parse(await req.json());
  } catch {
    return NextResponse.json({error: "Requête invalide."}, {status: 400});
  }

  const nextStatus = body.action === "APPROVE" ? "ACTIVE" : "REMOVED";

  await db.$transaction([
    db.alert.update({
      where: {id},
      data: {
        status: nextStatus,
        moderatedById: u.id,
        moderatedAt: new Date(),
        moderationNote: body.note,
      },
    }),
    db.auditLog.create({
      data: {
        action: `ALERT_${body.action}`,
        userId: u.id,
      },
    }),
  ]);

  return NextResponse.json({ok: true, status: nextStatus});
}
