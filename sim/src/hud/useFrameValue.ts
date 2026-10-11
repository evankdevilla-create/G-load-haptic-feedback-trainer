import { useEffect, useRef, useState } from "react";

/** Re-reads `read` once per animation frame, so overlays move with the 3D view. */
export function useFrameValue<T>(read: () => T): T {
  const [value, setValue] = useState<T>(read);
  const readRef = useRef(read);
  readRef.current = read;
  useEffect(() => {
    let id = 0;
    const loop = () => {
      setValue(readRef.current());
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, []);
  return value;
}
