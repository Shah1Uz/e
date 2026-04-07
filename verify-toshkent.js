const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testToshkentFiltering() {
  const regionId = "cmn0a8154008guussj1fszwf9"; // Toshkent shahri
  console.log(`Testing with Region ID: ${regionId}`);

  const where = {
    OR: [
      { locationId: regionId },
      { location: { parentId: regionId } }
    ],
    user: { isBlocked: false }
  };

  const listings = await prisma.listing.findMany({
    where,
    include: { location: true }
  });

  console.log(`Found ${listings.length} listings.`);
  listings.forEach(l => console.log(`- ${l.title} (Location: ${l.location.name})`));

  if (listings.length > 0) {
    console.log("SUCCESS: Hierarchical filtering works for Toshkent shahri.");
  } else {
    console.error("FAILURE: No listings found for Toshkent shahri.");
  }
}

testToshkentFiltering()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
