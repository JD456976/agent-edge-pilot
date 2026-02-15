/**
 * Haptic feedback utility — uses Capacitor Haptics when available,
 * gracefully no-ops in regular browsers.
 */

import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

const isNative = (): boolean => {
  try {
    return typeof (window as any)?.Capacitor?.isNativePlatform === 'function'
      ? (window as any).Capacitor.isNativePlatform()
      : false;
  } catch {
    return false;
  }
};

/** Light tap — buttons, toggles */
export async function tapLight() {
  if (!isNative()) return;
  await Haptics.impact({ style: ImpactStyle.Light });
}

/** Medium tap — completing actions, confirming */
export async function tapMedium() {
  if (!isNative()) return;
  await Haptics.impact({ style: ImpactStyle.Medium });
}

/** Heavy tap — destructive actions, important confirmations */
export async function tapHeavy() {
  if (!isNative()) return;
  await Haptics.impact({ style: ImpactStyle.Heavy });
}

/** Success notification — deal closed, task completed */
export async function notifySuccess() {
  if (!isNative()) return;
  await Haptics.notification({ type: NotificationType.Success });
}

/** Warning notification — risk alerts */
export async function notifyWarning() {
  if (!isNative()) return;
  await Haptics.notification({ type: NotificationType.Warning });
}

/** Error notification — failures */
export async function notifyError() {
  if (!isNative()) return;
  await Haptics.notification({ type: NotificationType.Error });
}

/** Selection tick — scrolling through pickers, lists */
export async function selectionTick() {
  if (!isNative()) return;
  await Haptics.selectionStart();
  await Haptics.selectionChanged();
  await Haptics.selectionEnd();
}
