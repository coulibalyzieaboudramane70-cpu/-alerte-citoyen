import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {getCurrentUser} from "@/lib/auth";
import {alertSchema} from "@/lib/validation";
import {randomBytes} from "crypto";
import {rateLimit, clientIp, RATE_LIMITS} from "@/lib/rateLimit";
import {rankAlerts, parsePagination} from "@/lib/search";

export async function GET(req: Request) {
  const {searchParams} = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  const type = searchParams.get("type") || undefined;
  const city = searchParams.get("city") || undefined;
  const {page, pageSize, skip, take} = parsePagination(searchParams);

  const where: any = {status: "ACTIVE"};
  if (type) where.type = type;
  if (city) where.city = {equals: city, mode: "insensitive"};
  if (q) {
    where.OR = [
      {title: {contains: q, mode: "insensitive"}},
      {description: {contains: q, mode: "insensitive"}},
      {personName: {contains: q, mode: "insensitive"}},
    ];
  }

  const candidatePoolSize = skip + take * 3;
  const rows = await db.alert.findMany({
    where,
    orderBy: {createdAt: "desc"},
    take: candidatePoolSize,
    include: {_count: {select: {contributions: true}}},
  });

  const ranked = rankAlerts(
    rows.map((r) => ({...r, contributionsCount: r._count.contributions})),
    q
  );
  const pageRows = ranked.slice(skip, skip + take);

  return NextResponse.json({
    ok: true,
    page,
    pageSize,
    count: pageRows.length,
    results: pageRows.map(({_count, ...rest}: any) => rest),
  });
}

export async function POST(req: Request) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({error: "Connexion requise."}, {status: 401});

  const rl = rateLimit(`alertCreate:${u.id}`, RATE_LIMITS.alertCreate.limit, RATE_LIMITS.alertCreate.windowMs);
  if (!rl.allowed) {
    return NextResponse.json(
      {error: "Trop de publications récentes. Réessayez plus tard."},
      {status: 429, headers: {"Retry-After": Math.ceil(rl.retryAfterMs / 1000).toString()}}
    );
  }

  try {
    const p = alertSchema.parse(await req.json());
    const a = await db.alert.create({
      data: {
        ...p,
        reference: "AC-" + randomBytes(4).toString("hex").toUpperCase(),
        authorId: u.id,
        status: "PENDING",
        dateOccurred: p.dateOccurred ? new Date(p.dateOccurred) : undefined,
      },
    });
    return NextResponse.json({ok: true, id: a.id});
  } catch {
    return NextResponse.json({error: "Alerte invalide."}, {status: 400});
  }
}
