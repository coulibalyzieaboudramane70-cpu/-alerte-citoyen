import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash("ChangeMe-12345!", 12);
  const demo = await db.user.upsert({
    where: { email: "demo@alerte-citoyen.ci" },
    update: {},
    create: {
      name: "Compte Démo",
      email: "demo@alerte-citoyen.ci",
      passwordHash: hash,
      isVerified: true,
      role: "USER",
    },
  });

  const modHash = await bcrypt.hash("Moderator-12345!", 12);
  await db.user.upsert({
    where: { email: "mod@alerte-citoyen.ci" },
    update: {},
    create: {
      name: "Moderateur",
      email: "mod@alerte-citoyen.ci",
      passwordHash: modHash,
      role: "MODERATOR",
      isVerified: true,
    },
  });

  const adminHash = await bcrypt.hash("Admin-12345!", 12);
  await db.user.upsert({
    where: { email: "admin@alerte-citoyen.ci" },
    update: {},
    create: {
      name: "Administrateur",
      email: "admin@alerte-citoyen.ci",
      passwordHash: adminHash,
      role: "ADMIN",
      isVerified: true,
    },
  });

  // create a demo alert if none exists
  const existing = await db.alert.findFirst();
  if (!existing) {
    await db.alert.create({
      data: {
        reference: "AC-DEMO-1",
        type: "MISSING_PERSON",
        title: "Personne disparue (démo)",
        description: "Alerte démo : personne disparue dans la ville.",
        city: "Abidjan",
        region: "Lagunes",
        authorId: demo.id,
        status: "ACTIVE",
      },
    });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
