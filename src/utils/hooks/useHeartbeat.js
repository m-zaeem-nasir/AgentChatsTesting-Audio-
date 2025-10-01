import { useEffect, useRef } from "react";
import { SendHeartBeat } from "../../voiceUtils";

/**
 * useHeartbeat – sends a heartbeat request every 12 seconds to keep the session alive.
 *
 * @param {string} sessionId  – The current session identifier.
 * @param {boolean} isConnected – Indicates whether the WebSocket or other connection is active.
 * @returns {number | null} – The interval ID (for manual clearing if desired).
 */
export default function useHeartbeat(sessionId, isConnected) {
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!isConnected || !sessionId) return;

    intervalRef.current = setInterval(() => {
      SendHeartBeat(sessionId)
        .then(() => console.log("heartbeat ok"))
        .catch((err) => console.warn("heartbeat failed", err));
    }, 12_000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [sessionId, isConnected]);

  return intervalRef.current;
}
