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
 * Champion portrait. Local cache first, Data Dragon fallback. Not lazy-loaded
 * because the grid is short.
 */
export function Portrait({
  championId,
  name,
  version,
  portraitDir,
  className,
  style,
}: Props) {
  const local = localPortrait(championId, portraitDir, version);
  const [src, setSrc] = useState(local ?? remotePortrait(championId, version));

  // Reset the source when the id changes.
  useEffect(() => {
    setSrc(localPortrait(championId, portraitDir, version) ?? remotePortrait(championId, version));
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
