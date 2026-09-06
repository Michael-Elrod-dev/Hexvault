import { useEffect, useState } from "react";
import { localPortrait, remotePortrait } from "../champions";

type Props = {
  championId: string;
  name: string;
  version: string;
  portraitDir: string;
  className?: string;
  style?: React.CSSProperties;
};

/**
 * Champion portrait, cache-first.
 *
 * Tries the locally cached PNG so the grid renders instantly and works offline,
 * and falls back to Data Dragon on the first run before the cache has filled.
 * Deliberately not lazy-loaded — the grid is short and lazy loading makes it
 * pop in while scrolling.
 */
export function Portrait({
  championId,
  name,
  version,
  portraitDir,
  className,
  style,
}: Props) {
  const local = localPortrait(championId, portraitDir);
  const [src, setSrc] = useState(local ?? remotePortrait(championId, version));

  // A new id (renamed champion, different search result) resets the cascade.
  useEffect(() => {
    setSrc(localPortrait(championId, portraitDir) ?? remotePortrait(championId, version));
  }, [championId, portraitDir, version]);

  return (
    <img
      src={src}
      alt={name}
      draggable={false}
      className={className}
      style={style}
      onError={() => {
        const remote = remotePortrait(championId, version);
        if (src !== remote) setSrc(remote);
      }}
    />
  );
}
