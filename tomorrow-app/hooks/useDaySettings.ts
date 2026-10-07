"use client";

import { useEffect, useState } from "react";
import { loadDaySettings, saveDaySettings } from "@/lib/storage";
import { DEFAULT_DAY_SETTINGS, type DaySettings } from "@/lib/types";

export function useDaySettings() {
  const [settings, setSettings] = useState<DaySettings>(DEFAULT_DAY_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setSettings(loadDaySettings());
    setLoaded(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (loaded) saveDaySettings(settings);
  }, [settings, loaded]);

  return { settings, setSettings, loaded };
}
