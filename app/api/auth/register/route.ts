import {NextResponse} from "next/server";
import bcrypt from "bcryptjs";
import {db} from "@/lib/db";
import {registerSchema} from "@/lib/validation";
import {createSession} from "@/lib/auth";
import {rateLimit, clientIp, RATE_LIMITS} from "@/lib/rateLimit";

export async function POST(req: Request) {
  const ip = clientIp(req);
  const rl = rateLimit(`register:${ip}`, RATE_LIMITS.register.limit, RATE_LIMITS.register.windowMs);
  if (!rl.allowed) {
    return NextResponse.json(
      {error: "Trop d'inscriptions depuis cette adresse. Réessayez plus tard."},
      {status: 429, headers: {"Retry-After": Math.ceil(rl.retryAfterMs / 1000).toString()}}
    );
  }
  try {
    const p = registerSchema.parse(await req.json());
    const exists = await db.user.findUnique({where: {email: p.email.toLowerCase()}});
    if (exists) return NextResponse.json({error: "Cet email est déjà utilisé."}, {status: 409});
    const hash = await bcrypt.hash(p.password, 12);
    const u = await db.user.create({data: {name: p.name, email: p.email.toLowerCase(), passwordHash: hash}});
    await createSession(u.id);
    return NextResponse.json({ok: true});
  } catch {
    return NextResponse.json({error: "Données invalides."}, {status: 400});
  }
}
