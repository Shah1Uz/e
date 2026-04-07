const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkCurrentListings() {
  const listings = await prisma.listing.findMany({
    include: { location: { include: { parent: true } } }
  });
  console.log(JSON.stringify(listings, null, 2));
}

checkCurrentListings()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
