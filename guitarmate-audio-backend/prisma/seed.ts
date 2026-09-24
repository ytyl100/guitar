import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting seed...');

  // 检查是否已有初始曲目
  const existingScore = await prisma.score.findFirst({
    where: { title: 'Hotel California' },
  });

  if (!existingScore) {
    const score = await prisma.score.create({
      data: {
        title: 'Hotel California',
        artist: 'Eagles',
        bpm: 75,
        timeSignature: '4/4',
        originalAudio: 'https://cdn.example.com/hotel_california.mp3',
        status: 'draft',
        tracks: {
          create: [
            {
              instrument: 'guitar_lead',
              audioUrl: 'https://cdn.example.com/hotel_california_lead.mp3',
              jsonUrl: 'https://cdn.example.com/hotel_california_lead.json',
            },
            {
              instrument: 'guitar_rhythm',
              audioUrl: 'https://cdn.example.com/hotel_california_rhythm.mp3',
            },
          ],
        },
      },
    });
    console.log('Seeded draft score:', score.id);

    // 同时添加一条示例 published 曲目，方便小程序 API 测试
    const publishedScore = await prisma.score.create({
      data: {
        title: 'Canon in D',
        artist: 'Johann Pachelbel',
        bpm: 80,
        timeSignature: '4/4',
        originalAudio: 'https://cdn.example.com/canon_in_d.mp3',
        coverUrl: 'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=600',
        status: 'published',
        tracks: {
          create: [
            {
              instrument: 'guitar',
              audioUrl: 'https://cdn.example.com/canon_guitar.mp3',
            },
          ],
        },
      },
    });
    console.log('Seeded published score:', publishedScore.id);
  } else {
    console.log('Existing score found:', existingScore.id);
  }

  console.log('Seed completed successfully.');
}

main()
  .catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
