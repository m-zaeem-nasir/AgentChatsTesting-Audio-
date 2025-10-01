import { useEffect, useState } from "react";
import { aiApi } from "../../services/api";

export default function useSessionValidation({
  sessionId,
  creditInfo,
  navigate,
  setSessionError,
}) {
  const [sessionValidated, setSessionValidated] = useState(false);
  const [duration, setDuration] = useState(5); // default fallback

  useEffect(() => {
    async function validate() {
      try {
        if (!sessionId) {
          setSessionError(
            "No active session found. Please start a new session."
          );
          setTimeout(() => navigate("/dashboard"), 2000);
          return;
        }

        if (creditInfo?.max_session_duration_seconds) {
          setDuration(creditInfo.max_session_duration_seconds);
          setSessionValidated(true);
          return;
        }

        const res = await aiApi.get(
          `/api/v1/voice-agent/session/${sessionId}/duration`
        );
        if (res?.data?.durationSeconds) {
          setDuration(res.data.durationSeconds);
          setSessionValidated(true);
        }
      } catch (err) {
        console.error(err);
        setSessionError(
          "Failed to validate session. Please try again."
        );
        setTimeout(() => navigate("/dashboard"), 3000);
      }
    }

    validate();
  }, [sessionId, creditInfo, navigate, setSessionError]);

  return { sessionValidated, duration };
}
