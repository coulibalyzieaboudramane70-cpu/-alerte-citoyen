import {NextResponse} from "next/server";
import bcrypt from "bcryptjs";
import {db} from "@/lib/db";
import {loginSchema} from "@/lib/validation";
import {createSession} from "@/lib/auth";
import {rateLimit, clientIp, RATE_LIMITS} from "@/lib/rateLimit";

export async function POST(req: Request) {
  const ip = clientIp(req);
  const rl = rateLimit(`login:${ip}`, RATE_LIMITS.login.limit, RATE_LIMITS.login.windowMs);
  if (!rl.allowed) {
    return NextResponse.json(
      {error: "Trop de tentatives. Réessayez dans quelques minutes."},
      {status: 429, headers: {"Retry-After": Math.ceil(rl.retryAfterMs / 1000).toString()}}
    );
  }
  try {
    const p = loginSchema.parse(await req.json());
    const u = await db.user.findUnique({where: {email: p.email.toLowerCase()}});
    if (!u || !(await bcrypt.compare(p.password, u.passwordHash))) {
      return NextResponse.json({error: "Identifiants incorrects."}, {status: 401});
    }
    await createSession(u.id);
    return NextResponse.json({ok: true});
  } catch {
    return NextResponse.json({error: "Données invalides."}, {status: 400});
  }
}
