import { useState, useEffect, useCallback } from 'react';
import type { AppSettings } from '../types';
import { getSettings, updateSettings } from '../services/api';

const DEFAULTS: AppSettings = {
  trading_mode: 'demo',
  claude_model: 'claude-sonnet-4-5-20250929',
  claude_max_tokens: 4096,
};

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const cached = localStorage.getItem('app-settings');
      return cached ? JSON.parse(cached) : DEFAULTS;
    } catch {
      return DEFAULTS;
    }
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSettings()
      .then((s) => {
        setSettings(s);
        localStorage.setItem('app-settings', JSON.stringify(s));
      })
      .catch(() => {
        /* use cached/defaults */
      })
      .finally(() => setLoading(false));
  }, []);

  const saveSettings = useCallback(
    async (patch: Partial<AppSettings>) => {
      setError(null);
      try {
        const updated = await updateSettings(patch);
        setSettings(updated);
        localStorage.setItem('app-settings', JSON.stringify(updated));
        return updated;
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        setError(msg);
        throw e;
      }
    },
    []
  );

  return { settings, saveSettings, loading, error };
}
