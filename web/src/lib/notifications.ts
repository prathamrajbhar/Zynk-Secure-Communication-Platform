/**
 * Browser Notification utility for Zynk
 * Handles permission requests and showing native OS/browser notifications
 * for incoming messages and calls.
 * Also handles app badge count and notification sounds.
 */

let permissionGranted = false;
let notificationSoundEnabled = true;

// Preload notification sounds
let messageSound: HTMLAudioElement | null = null;
let callSound: HTMLAudioElement | null = null;

function initSounds() {
  if (typeof window === 'undefined') return;
  try {
    messageSound = new Audio('/sounds/message.wav');
    messageSound.volume = 0.5;
    callSound = new Audio('/sounds/ringtone.mp3');
    callSound.volume = 0.7;
    callSound.loop = true;
  } catch {
    // Audio not available
  }
}

// Init sounds lazily
if (typeof window !== 'undefined') {
  initSounds();
}

/**
 * Play notification sound for messages
 */
export function playMessageSound(): void {
  if (!notificationSoundEnabled || !messageSound) return;
  messageSound.currentTime = 0;
  messageSound.play().catch(() => {});
}

/**
 * Play/stop ringtone for incoming calls
 */
export function playRingtone(): void {
  if (!callSound) return;
  callSound.currentTime = 0;
  callSound.play().catch(() => {});
}

export function stopRingtone(): void {
  if (!callSound) return;
  callSound.pause();
  callSound.currentTime = 0;
}

/**
 * Toggle notification sounds
 */
export function setNotificationSoundEnabled(enabled: boolean): void {
  notificationSoundEnabled = enabled;
}

/**
 * Update the app badge with unread count.
 * Uses the Badging API (Chrome, Edge) and falls back to favicon.
 */
export function updateAppBadge(count: number): void {
  if (typeof navigator === 'undefined') return;

  // Use Badging API if available
  if ('setAppBadge' in navigator) {
    const nav = navigator as Navigator & { setAppBadge: (count: number) => Promise<void>; clearAppBadge: () => Promise<void> };
    if (count > 0) {
      nav.setAppBadge(count).catch(() => {});
    } else {
      nav.clearAppBadge().catch(() => {});
    }
    return;
  }

  // Fallback: update favicon with badge
  updateFaviconBadge(count);
}

/**
 * Draw a badge count on the favicon
 */
function updateFaviconBadge(count: number): void {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Draw base icon (purple square)
  ctx.fillStyle = '#5b5fc7';
  ctx.beginPath();
  ctx.roundRect(0, 0, 32, 32, 6);
  ctx.fill();

  // Draw "Z" letter
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Z', 16, 17);

  if (count > 0) {
    // Draw badge circle
    const badgeText = count > 99 ? '99+' : count.toString();
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(26, 6, 8, 0, Math.PI * 2);
    ctx.fill();

    // Draw badge number
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(badgeText, 26, 7);
  }

  // Update favicon
  let link = document.querySelector("link[rel='icon']") as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = canvas.toDataURL();
}

/**
 * Request notification permission from the user.
 * Call this early (e.g., on app mount) so the browser prompt appears.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    console.warn('Browser does not support notifications');
    return false;
  }

  if (Notification.permission === 'granted') {
    permissionGranted = true;
    return true;
  }

  if (Notification.permission === 'denied') {
    return false;
  }

  try {
    const result = await Notification.requestPermission();
    permissionGranted = result === 'granted';
    return permissionGranted;
  } catch {
    return false;
  }
}

/**
 * Check if we're allowed to send notifications.
 */
function canNotify(): boolean {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  return Notification.permission === 'granted';
}

/**
 * Check if the tab/window is currently focused.
 * We skip notifications when the user is actively looking at the app.
 */
function isPageVisible(): boolean {
  if (typeof document === 'undefined') return true;
  return document.visibilityState === 'visible' && document.hasFocus();
}

interface NotifyOptions {
  title: string;
  body: string;
  tag?: string;            // deduplication key
  icon?: string;
  onClick?: () => void;
  /** Auto-close after ms (default: 5000) */
  timeout?: number;
}

/**
 * Show a native browser/OS notification.
 * Skipped if the page is visible & focused (user is already looking at it),
 * unless `force` is true.
 */
export function showBrowserNotification(
  options: NotifyOptions,
  { force = false }: { force?: boolean } = {}
): Notification | null {
  if (!canNotify()) return null;

  // Don't notify if user is already on the page (unless forced)
  if (!force && isPageVisible()) return null;

  const notification = new Notification(options.title, {
    body: options.body,
    tag: options.tag,         // prevents duplicate notifications with same tag
    icon: options.icon || '/icons/zynk-icon.png',
    badge: '/icons/zynk-badge.png',
    silent: false,
  });

  notification.onclick = () => {
    // Focus the window/tab
    window.focus();
    options.onClick?.();
    notification.close();
  };

  // Auto-close
  const timeout = options.timeout ?? 5000;
  if (timeout > 0) {
    setTimeout(() => notification.close(), timeout);
  }

  return notification;
}

// ----------------------------------------------------------------
// Convenience helpers for specific event types
// ----------------------------------------------------------------

/**
 * Notify for an incoming message.
 * @param senderName  display name or username of the sender
 * @param text        message preview text (will be truncated)
 * @param conversationId  used as tag so second message from same chat replaces first
 * @param onClick     callback when notification is clicked
 */
export function notifyIncomingMessage(
  senderName: string,
  text: string,
  conversationId: string,
  onClick?: () => void
) {
  // Truncate long messages
  const preview = text.length > 100 ? text.slice(0, 100) + '…' : text;

  return showBrowserNotification({
    title: senderName,
    body: preview,
    tag: `msg-${conversationId}`,
    onClick,
    timeout: 5000,
  });
}

/**
 * Notify for an incoming call.
 * Uses a longer timeout and a unique tag so it stays visible.
 */
export function notifyIncomingCall(
  callerName: string,
  callType: 'audio' | 'video',
  callId: string,
  onClick?: () => void
) {
  const typeLabel = callType === 'video' ? 'Video' : 'Voice';

  return showBrowserNotification(
    {
      title: `Incoming ${typeLabel} Call`,
      body: `${callerName} is calling you`,
      tag: `call-${callId}`,
      onClick,
      timeout: 30000, // keep visible until answered / missed
    },
    { force: true } // always show call notifications, even when tab is focused
  );
}

/**
 * Notify for a missed call.
 */
export function notifyMissedCall(
  callerName: string,
  callType: 'audio' | 'video'
) {
  const typeLabel = callType === 'video' ? 'video' : 'voice';

  return showBrowserNotification({
    title: 'Missed Call',
    body: `You missed a ${typeLabel} call from ${callerName}`,
    tag: `missed-call-${Date.now()}`,
    timeout: 8000,
  });
}

/**
 * Close a notification by its tag (e.g., when a call is answered).
 */
export function dismissNotificationByTag(tag: string) {
  // The Notification API doesn't provide a way to close by tag directly,
  // but using the same tag when creating a new empty notification effectively
  // replaces it. The simplest approach is to track active notifications.
  // For now, we rely on `tag` deduplication — creating a new notification
  // with the same tag replaces the old one, and we close it immediately.
  if (!canNotify()) return;
  try {
    const n = new Notification('', { tag, silent: true });
    n.close();
  } catch {
    // ignore
  }
}
