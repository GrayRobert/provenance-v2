'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { toast } from 'sonner';
import type { UserProfileResponse } from '@/lib/api';
import {
  PREMIUM_PLUGIN_GATE_IDS,
  fetchPremiumPluginEnabledMap,
  premiumPluginDisplayName,
  type PremiumPluginGateId,
} from '@/lib/premiumPluginPreferences';
import {
  markGraceModalShown,
  shouldShowGraceModal,
  usePluginAccess,
} from '@/lib/usePluginAccess';

export { premiumPluginDisplayName } from '@/lib/premiumPluginPreferences';

/**
 * Paid / grace gating plus per-plugin enable flags from Profile → Premium Plugins.
 */
export function usePremiumPluginGate(profile: UserProfileResponse | null) {
  const router = useRouter();
  const pathname = usePathname();
  const pluginAccess = usePluginAccess(profile, 'premium_plugins');
  const [enabledByGateId, setEnabledByGateId] = useState<Record<string, boolean> | null>(null);
  const [graceModalOpen, setGraceModalOpen] = useState(false);
  const [graceModalPlugin, setGraceModalPlugin] = useState('');
  const pendingAfterGraceRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!profile) {
      setEnabledByGateId(null);
      return;
    }
    let cancel = false;
    fetchPremiumPluginEnabledMap(pluginAccess.canUse)
      .then((map) => {
        if (!cancel) setEnabledByGateId(map);
      })
      .catch(() => {
        if (!cancel) {
          const fallback = {} as Record<PremiumPluginGateId, boolean>;
          for (const g of PREMIUM_PLUGIN_GATE_IDS) {
            fallback[g] = pluginAccess.canUse;
          }
          setEnabledByGateId(fallback);
        }
      });
    return () => {
      cancel = true;
    };
  }, [profile, pluginAccess.canUse, pathname]);

  const runWithPluginGate = useCallback(
    (pluginId: string, proceed: () => void) => {
      if (enabledByGateId !== null && enabledByGateId[pluginId] === false) {
        toast.message(
          `${premiumPluginDisplayName(pluginId)} is turned off in Profile → Premium Plugins.`
        );
        return;
      }
      if (!pluginAccess.canUse) {
        const from = pathname ? encodeURIComponent(pathname) : '';
        router.push(from ? `/pricing?from=${from}` : '/pricing');
        return;
      }
      if (pluginAccess.showGraceModal && shouldShowGraceModal(pluginAccess, pluginId)) {
        pendingAfterGraceRef.current = () => {
          markGraceModalShown(pluginId);
          proceed();
        };
        setGraceModalPlugin(premiumPluginDisplayName(pluginId));
        setGraceModalOpen(true);
        return;
      }
      proceed();
    },
    [enabledByGateId, pluginAccess, pathname, router]
  );

  const handleGraceModalClose = useCallback(() => {
    pendingAfterGraceRef.current?.();
    pendingAfterGraceRef.current = null;
    setGraceModalOpen(false);
  }, []);

  return {
    runWithPluginGate,
    graceModalOpen,
    graceModalPlugin,
    handleGraceModalClose,
    pluginAccess,
    premiumPluginEnabledByGateId: enabledByGateId,
  };
}
