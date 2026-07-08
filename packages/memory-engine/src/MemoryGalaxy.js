import * as React from "react";

export function MemoryGalaxy({
  memories = [],
  src = "/",
  title = "I Remember memory galaxy",
  deterministic = false,
  className,
  style,
}) {
  const url = React.useMemo(() => {
    const next = new URL(src, "http://i-remember.local");
    if (deterministic) next.searchParams.set("qaDeterministic", "1");
    return `${next.pathname}${next.search}${next.hash}`;
  }, [deterministic, src]);

  return React.createElement("iframe", {
    title,
    className,
    "data-memory-count": memories.length,
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
