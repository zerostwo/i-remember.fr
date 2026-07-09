import * as React from "react";
import { normalizeGalaxyMemories, normalizeGalaxyPosts } from "./normalize.js";

export function MemoryGalaxy({
  memories = [],
  src = "/",
  title = "I Remember memory galaxy",
  deterministic = false,
  className,
  style,
}) {
  const normalizedMemories = React.useMemo(() => normalizeGalaxyMemories(memories), [memories]);
  const legacyPosts = React.useMemo(() => normalizeGalaxyPosts(memories), [memories]);
  const legacyPayload = React.useMemo(() => JSON.stringify(legacyPosts), [legacyPosts]);
  const storageKey = React.useMemo(() => {
    return `i-remember:memory-engine:${Math.random().toString(36).slice(2)}`;
  }, []);
  const [storedPayload, setStoredPayload] = React.useState("");

  React.useEffect(() => {
    if (!legacyPosts.length || typeof window === "undefined" || !window.sessionStorage) {
      setStoredPayload("");
      return;
    }
    try {
      window.sessionStorage.setItem(storageKey, legacyPayload);
      setStoredPayload(legacyPayload);
      return () => window.sessionStorage.removeItem(storageKey);
    } catch {
      setStoredPayload("unavailable");
    }
  }, [legacyPayload, legacyPosts.length, storageKey]);

  const hasStoredDataset = legacyPosts.length > 0 && storedPayload === legacyPayload;
  const url = React.useMemo(() => {
    const next = new URL(src, "http://i-remember.local");
    if (deterministic) next.searchParams.set("qaDeterministic", "1");
    if (hasStoredDataset) next.searchParams.set("memoryEngineDataset", storageKey);
    return `${next.pathname}${next.search}${next.hash}`;
  }, [deterministic, hasStoredDataset, src, storageKey]);

  if (legacyPosts.length > 0 && !hasStoredDataset && storedPayload !== "unavailable") {
    return React.createElement("div", {
      className,
      "data-memory-count": normalizedMemories.length,
      style: {
        display: "block",
        height: "100%",
        width: "100%",
        ...style,
      },
    });
  }

  return React.createElement("iframe", {
    title,
    className,
    "data-memory-count": normalizedMemories.length,
    src: url,
    style: {
      border: 0,
      display: "block",
      height: "100%",
      width: "100%",
      ...style,
    },
  });
}
