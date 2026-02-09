/**
 * Push Notification Service
 * Sends push notifications via Firebase Cloud Messaging (FCM) for Android/Web
 * and APNs for iOS when users are offline.
 * 
 * This service is called from the WebSocket handler when a recipient
 * has no active socket connections.
 */

import prisma from '../db/client';

// FCM v1 HTTP API endpoint (Google Cloud Project based)
const FCM_API_URL = process.env.FCM_API_URL || '';
const FCM_SERVER_KEY = process.env.FCM_SERVER_KEY || '';

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
  tag?: string;
  badge?: number;
  sound?: string;
}

/**
 * Get all push tokens for a user's devices
 */
async function getUserPushTokens(userId: string): Promise<{ token: string; platform: string }[]> {
  const devices = await prisma.device.findMany({
    where: {
      user_id: userId,
      push_token: { not: null },
    },
    select: {
      push_token: true,
      platform: true,
    },
  });

  return devices
    .filter((d) => d.push_token)
    .map((d) => ({ token: d.push_token!, platform: d.platform }));
}

/**
 * Send push notification to a single device token via FCM
 */
async function sendFCM(token: string, payload: PushPayload): Promise<boolean> {
  if (!FCM_SERVER_KEY) {
    console.warn('FCM_SERVER_KEY not configured, skipping push notification');
    return false;
  }

  try {
    const response = await fetch('https://fcm.googleapis.com/fcm/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `key=${FCM_SERVER_KEY}`,
      },
      body: JSON.stringify({
        to: token,
        notification: {
          title: payload.title,
          body: payload.body,
          tag: payload.tag,
          sound: payload.sound || 'default',
          badge: payload.badge,
          click_action: 'OPEN_APP',
        },
        data: payload.data || {},
        priority: 'high',
        // Time-to-live: 1 hour
        time_to_live: 3600,
      }),
    });

    if (!response.ok) {
      console.error('FCM push failed:', response.status, await response.text());
      return false;
    }

    const result = await response.json() as { success: number; failure: number; results?: { error?: string }[] };
    
    // Handle invalid tokens
    if (result.failure > 0 && result.results) {
      for (const r of result.results) {
        if (r.error === 'NotRegistered' || r.error === 'InvalidRegistration') {
          // Remove invalid push token from device
          await prisma.device.updateMany({
            where: { push_token: token },
            data: { push_token: null },
          });
          console.log('Removed invalid push token:', token.substring(0, 20) + '...');
        }
      }
    }

    return (result.success ?? 0) > 0;
  } catch (error) {
    console.error('FCM push error:', error);
    return false;
  }
}

/**
 * Send push notification to a user (all their registered devices)
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<number> {
  const tokens = await getUserPushTokens(userId);
  if (tokens.length === 0) return 0;

  let successCount = 0;
  const promises = tokens.map(async ({ token }) => {
    const sent = await sendFCM(token, payload);
    if (sent) successCount++;
  });

  await Promise.allSettled(promises);
  return successCount;
}

/**
 * Send a new message push notification
 */
export async function pushNewMessage(
  recipientId: string,
  senderName: string,
  messagePreview: string,
  conversationId: string,
  messageType: string = 'text'
): Promise<void> {
  const body =
    messageType === 'image' ? '📷 Photo'
    : messageType === 'file' ? '📎 File'
    : messageType === 'audio' ? '🎤 Voice message'
    : messageType === 'video' ? '🎬 Video'
    : messagePreview.length > 100 ? messagePreview.substring(0, 97) + '...' : messagePreview;

  await sendPushToUser(recipientId, {
    title: senderName,
    body,
    tag: `msg-${conversationId}`,
    data: {
      type: 'message',
      conversation_id: conversationId,
    },
  });
}

/**
 * Send an incoming call push notification
 */
export async function pushIncomingCall(
  recipientId: string,
  callerName: string,
  callType: 'audio' | 'video',
  callId: string
): Promise<void> {
  await sendPushToUser(recipientId, {
    title: `Incoming ${callType} call`,
    body: `${callerName} is calling you`,
    tag: `call-${callId}`,
    sound: 'ringtone',
    data: {
      type: 'call',
      call_type: callType,
      call_id: callId,
      caller_name: callerName,
    },
  });
}

/**
 * Send a missed call push notification
 */
export async function pushMissedCall(
  recipientId: string,
  callerName: string,
  callType: 'audio' | 'video'
): Promise<void> {
  await sendPushToUser(recipientId, {
    title: 'Missed call',
    body: `${callerName} tried to call you (${callType})`,
    tag: `missed-call-${Date.now()}`,
    data: {
      type: 'missed_call',
      caller_name: callerName,
    },
  });
}

/**
 * Register a device push token (called from device registration endpoint)
 */
export async function registerPushToken(deviceId: string, pushToken: string): Promise<void> {
  await prisma.device.update({
    where: { id: deviceId },
    data: { push_token: pushToken },
  });
}
