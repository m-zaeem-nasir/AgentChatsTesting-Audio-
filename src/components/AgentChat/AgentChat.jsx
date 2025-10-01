import { useEffect, useState } from "react";
import { Paper, Box, Textarea } from "@mui/joy";

import Header from "./Header";
import VoiceControls from "./VoiceControls";
import AvatarOrbs from "./AvatarOrbs";
import SnackbarNotifier from "./SnackbarNotifier";
import DebugPanel from "../../common/DebugPanel";

import useSessionValidation from "../../utils/hooks/useSessionValidation";
import useWebSocket from "../../utils/hooks/useWebSocket";
import useAudioRecorder from "../../utils/hooks/useAudioRecorder";
import useAudioPlayer from "../../utils/hooks/useAudioPlayer";
import useHeartbeat from "../../utils/hooks/useHeartbeat";

export default function AgentChat({ sessionId }) {
  const [inputMessage, setInputMessage] = useState("");
  const [displayMessage, setDisplayMessage] = useState("");
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState("");
  const [showSessionEnded, setShowSessionEnded] = useState(false);

  const { sessionValidated, duration } = useSessionValidation({ sessionId });
  const { connect, disconnect, onMessage, isConnected } = useWebSocket();
  const { isRecording, startRecording, stopRecording } = useAudioRecorder();
  const { queueAudio } = useAudioPlayer();
  useHeartbeat(sessionId, isConnected);

  // Connect to the WebSocket when the session is validated
  useEffect(() => {
    if (!sessionValidated) return;

    const wsUrl = `wss://example.com/ws/${sessionId}`;
    connect(wsUrl).then(() => {
      onMessage((event) => {
        const msg = JSON.parse(event.data);
        // Assume the server sends audio as { type: 'agent_audio', data: ArrayBuffer }
        if (msg.type === "agent_audio" && msg.data) {
          queueAudio(msg.data);
        }
      });
    });
    return () => disconnect();
  }, [sessionValidated, sessionId]);

  const handleMicToggle = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const endCall = () => {
    setShowSessionEnded(true);
    disconnect();
    setSnackbarMessage("Session ended");
    setSnackbarOpen(true);
    // In a real app you would navigate to the dashboard here
  };

  return (
    <Paper
      sx={{
        p: 3,
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Header displayName="Agent" />
      <Box sx={{ flexGrow: 1, mt: 3 }}>
        <AvatarOrbs
          voiceOnly
          audioRecorder={{ isRecording }}
          agentSpeaking={false}
        />
        <Textarea
          minRows={3}
          placeholder="Type a message"
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          sx={{ flex: 1, mt: 2, mb: 2 }}
        />
        <VoiceControls
          isRecording={isRecording}
          isMuted={false}
          onMicToggle={handleMicToggle}
          onEndCall={endCall}
          voiceOnly
        />
        <SnackbarNotifier
          open={snackbarOpen}
          message={snackbarMessage}
          onClose={() => setSnackbarOpen(false)}
        />
      </Box>
      <DebugPanel />
    </Paper>
  );
}
