// ═══════════════════════════════════════════════════════
// ZYNK UI — Device Limit Modal (HeroUI v7)
// ═══════════════════════════════════════════════════════

'use client';

import {
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Button,
} from '@heroui/react';
import { Monitor, Smartphone, Tablet, Globe } from 'lucide-react';

interface DeviceInfo {
  id: string;
  device_name: string;
  platform: string;
  last_active_at: string;
  created_at: string;
}

interface DeviceLimitModalProps {
  devices: DeviceInfo[];
  maxDevices: number;
  onRemoveAndLogin: (deviceId: string) => void;
  onCancel: () => void;
  loading: boolean;
}

const PLATFORM_ICONS: Record<string, typeof Monitor> = {
  desktop: Monitor,
  mobile: Smartphone,
  tablet: Tablet,
  web: Globe,
};

function getDeviceIcon(platform: string) {
  return PLATFORM_ICONS[platform.toLowerCase()] || Globe;
}

export default function DeviceLimitModal({ devices, maxDevices, onRemoveAndLogin, onCancel, loading }: DeviceLimitModalProps) {
  return (
    <Modal isOpen={true} onOpenChange={(open) => { if (!open) onCancel(); }} size="md" placement="center"
      classNames={{ base: 'bg-content1 border border-divider', header: 'border-b border-divider', footer: 'border-t border-divider' }}>
      <ModalContent>
        <ModalHeader className="flex-col items-start">
          <h2 className="text-lg font-bold text-foreground">Device Limit Reached</h2>
          <p className="text-xs text-default-400 font-normal mt-0.5">
            Max {maxDevices} devices. Remove one to sign in.
          </p>
        </ModalHeader>

        <ModalBody>
          <div className="space-y-2 max-h-[320px] overflow-y-auto">
            {devices.map((device) => {
              const Icon = getDeviceIcon(device.platform);
              return (
                <div
                  key={device.id}
                  className="flex items-center gap-3 p-3 rounded-xl bg-content2 border border-divider hover:border-primary/30 transition-colors"
                >
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{device.device_name}</p>
                    <p className="text-xs text-default-400">
                      Last active: {new Date(device.last_active_at).toLocaleDateString()}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    color="danger"
                    variant="flat"
                    radius="lg"
                    isLoading={loading}
                    onPress={() => onRemoveAndLogin(device.id)}
                  >
                    Remove
                  </Button>
                </div>
              );
            })}
          </div>
        </ModalBody>

        <ModalFooter>
          <Button variant="flat" fullWidth onPress={onCancel} className="font-semibold">
            Cancel
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
