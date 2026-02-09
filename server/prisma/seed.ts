/**
 * Zynk Database Seed Script
 *
 * Creates test users (alice, bob, charlie, diana) with known passwords,
 * profiles, and sample conversations for development and testing.
 *
 * Usage: npx tsx prisma/seed.ts
 */

import { PrismaClient, ConversationType, ParticipantRole, MessageType, MessageStatus, Platform } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import 'dotenv/config';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const BCRYPT_ROUNDS = 10; // Faster for seeding
const DEFAULT_PASSWORD = 'password123';

interface SeedUser {
  username: string;
  display_name: string;
  bio: string;
}

const SEED_USERS: SeedUser[] = [
  { username: 'alice', display_name: 'Alice', bio: 'Security researcher and cryptography enthusiast' },
  { username: 'bob', display_name: 'Bob', bio: 'Software engineer building cool things' },
  { username: 'charlie', display_name: 'Charlie', bio: 'Privacy advocate and open-source contributor' },
  { username: 'diana', display_name: 'Diana', bio: 'Product manager who loves secure comms' },
  { username: 'eve', display_name: 'Eve', bio: 'Test user for presence and broadcast events' },
];

async function main() {
  console.log('🌱 Seeding Zynk database...\n');

  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, BCRYPT_ROUNDS);

  // Create users with profiles
  const users: Record<string, string> = {};

  for (const seedUser of SEED_USERS) {
    const existing = await prisma.user.findUnique({ where: { username: seedUser.username } });
    if (existing) {
      console.log(`  ⏩ User '${seedUser.username}' already exists (${existing.id})`);
      users[seedUser.username] = existing.id;

      // Ensure profile exists
      const profile = await prisma.userProfile.findUnique({ where: { user_id: existing.id } });
      if (!profile) {
        await prisma.userProfile.create({
          data: {
            user_id: existing.id,
            display_name: seedUser.display_name,
            bio: seedUser.bio,
          },
        });
        console.log(`    ✓ Created missing profile for '${seedUser.username}'`);
      }
      continue;
    }

    const user = await prisma.user.create({
      data: {
        username: seedUser.username,
        password_hash: passwordHash,
        public_key: '',
        profile: {
          create: {
            display_name: seedUser.display_name,
            bio: seedUser.bio,
          },
        },
      },
    });
    users[seedUser.username] = user.id;
    console.log(`  ✓ Created user '${seedUser.username}' (${user.id})`);
  }

  const alice = users['alice'];
  const bob = users['bob'];
  const charlie = users['charlie'];

  // Create sample conversations (alice<->bob, alice<->charlie)
  const conversations = [
    { user1: alice, user2: bob, name: 'alice<->bob' },
    { user1: alice, user2: charlie, name: 'alice<->charlie' },
  ];

  for (const conv of conversations) {
    // Check if conversation already exists
    const existing = await prisma.conversation.findFirst({
      where: {
        type: 'one_to_one',
        AND: [
          { participants: { some: { user_id: conv.user1 } } },
          { participants: { some: { user_id: conv.user2 } } },
        ],
      },
    });

    if (existing) {
      console.log(`  ⏩ Conversation ${conv.name} already exists`);
      continue;
    }

    const newConv = await prisma.conversation.create({
      data: {
        type: 'one_to_one' as ConversationType,
        participants: {
          create: [
            { user_id: conv.user1, role: 'member' as ParticipantRole },
            { user_id: conv.user2, role: 'member' as ParticipantRole },
          ],
        },
      },
    });

    // Add a sample message
    await prisma.messages.create({
      data: {
        conversation_id: newConv.id,
        sender_id: conv.user1,
        encrypted_content: `Hello from ${conv.name}! (seed data)`,
        message_type: 'text' as MessageType,
        status: 'delivered' as MessageStatus,
      },
    });

    console.log(`  ✓ Created conversation ${conv.name} with sample message`);
  }

  // Create a sample group (Security Research)
  const existingGroup = await prisma.group.findFirst({
    where: { name: 'Security Research', created_by: alice },
  });

  if (!existingGroup) {
    const groupConv = await prisma.conversation.create({
      data: {
        type: 'group' as ConversationType,
      },
    });

    const group = await prisma.group.create({
      data: {
        name: 'Security Research',
        description: 'Discussing encryption and security topics',
        conversation_id: groupConv.id,
        created_by: alice,
        members: {
          create: [
            { user_id: alice, role: 'admin' as ParticipantRole },
            { user_id: bob, role: 'member' as ParticipantRole, invited_by: alice },
            { user_id: charlie, role: 'member' as ParticipantRole, invited_by: alice },
          ],
        },
      },
    });

    // Add conversation participants
    await prisma.conversationParticipant.createMany({
      data: [
        { conversation_id: groupConv.id, user_id: alice, role: 'admin' as ParticipantRole },
        { conversation_id: groupConv.id, user_id: bob, role: 'member' as ParticipantRole },
        { conversation_id: groupConv.id, user_id: charlie, role: 'member' as ParticipantRole },
      ],
      skipDuplicates: true,
    });

    console.log(`  ✓ Created group 'Security Research' (${group.id})`);
  } else {
    console.log(`  ⏩ Group 'Security Research' already exists`);
  }

  console.log('\n✅ Seed complete!\n');
  console.log('Test credentials:');
  console.log('  All users: password = "password123"');
  console.log(`  Users: ${SEED_USERS.map(u => u.username).join(', ')}`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
