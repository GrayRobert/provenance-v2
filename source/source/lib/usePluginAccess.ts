'use client';

import type { UserProfileResponse } from './api';

// Local-first version: no plans or billing; every plugin is available.

export const GRACE_PERIOD_DAYS = 100;

export function getAccountGraceDaysRemaining(
  _profile: { createdAt?: string | null; plan?: string | null } | null | undefined
): number | null {
  return null;
}

export type PluginFeature = 'premium_plugins' | 'certificate_export';

export interface PluginAccessResult {
  canUse: boolean;
  inGracePeriod: boolean;
  showGraceModal: boolean;
}

export function usePluginAccess(
  _profile: UserProfileResponse | null,
  _feature: PluginFeature
): PluginAccessResult {
  return { canUse: true, inGracePeriod: false, showGraceModal: false };
}

export function pluginGraceShownKey(pluginId: string): string {
  return `plugin_grace_shown_${pluginId}`;
}

export function shouldShowGraceModal(
  _result: PluginAccessResult,
  _pluginId: string
): boolean {
  return false;
}

export function markGraceModalShown(_pluginId: string): void {}
