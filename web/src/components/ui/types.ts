// ═══════════════════════════════════════════════════════
// ZYNK UI — Type Definitions
// ═══════════════════════════════════════════════════════

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type BadgeVariant = 'default' | 'accent' | 'danger' | 'success' | 'warning';
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'icon';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface AvatarProps {
  name: string;
  src?: string | null;
  size?: AvatarSize;
  color?: string;
  isOnline?: boolean;
  showStatus?: boolean;
  className?: string;
  onClick?: () => void;
}

export interface BadgeProps {
  count: number;
  max?: number;
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  dot?: boolean;
  className?: string;
}

export interface ProgressBarProps {
  value: number;
  max?: number;
  variant?: 'default' | 'accent' | 'success' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  animated?: boolean;
  showLabel?: boolean;
  className?: string;
}

export interface AnimatedPresenceProps {
  children: React.ReactNode;
  show: boolean;
  animation?: 'fade' | 'slide-up' | 'slide-down' | 'slide-left' | 'slide-right' | 'scale' | 'bounce';
  duration?: number;
  className?: string;
}

export interface ToastData {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
  duration?: number;
}
