import prisma from '../db/client';
import { CronJob } from 'cron';

/**
 * Cleanup job for expired disappearing messages
 * Runs every 5 minutes to delete messages past their expiry time
 */
export function startDisappearingMessageCleanup() {
  const job = new CronJob(
    '*/5 * * * *', // Every 5 minutes
    async () => {
      try {
        const now = new Date();
        
        // Find and delete expired messages
        const result = await prisma.messages.updateMany({
          where: {
            expires_at: {
              lte: now
            },
            deleted_at: null
          },
          data: {
            deleted_at: now,
            encrypted_content: '[expired]'
          }
        });

        if (result.count > 0) {
          console.log(`[DisappearingMessages] Cleaned up ${result.count} expired message(s)`);
        }
      } catch (error) {
        console.error('[DisappearingMessages] Cleanup error:', error);
      }
    },
    null,
    true,
    'UTC'
  );

  job.start();
  console.log('[DisappearingMessages] Cleanup job started (runs every 5 minutes)');
  
  return job;
}

/**
 * Alternative: More aggressive immediate cleanup
 * Deletes messages that expired in the last 30 seconds
 */
export async function cleanupExpiredMessagesNow(): Promise<number> {
  try {
    const now = new Date();
    
    const result = await prisma.messages.updateMany({
      where: {
        expires_at: {
          lte: now
        },
        deleted_at: null
      },
      data: {
        deleted_at: now,
        encrypted_content: '[expired]'
      }
    });

    return result.count;
  } catch (error) {
    console.error('[DisappearingMessages] Immediate cleanup error:', error);
    return 0;
  }
}
