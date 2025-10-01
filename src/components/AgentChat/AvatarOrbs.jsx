import Box from "@mui/joy/Box";
import VoiceAgentOrb from "../orb/VoiceAgentOrb";

export default function AvatarOrbs({
  voiceOnly,
  audioRecorder,
  agentSpeaking,
}) {
  return (
    <Box
      sx={{
        width: { xs: "80%", sm: "60%" },
        height: "85%",
        borderRadius: "20px",
        overflow: "hidden",
        mb: 4,
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {voiceOnly && (
        <Box
          sx={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <VoiceAgentOrb
            size={260}
            opacity={
              audioRecorder.isRecording || agentSpeaking ? 0.9 : 0.6
            }
          />
        </Box>
      )}
    </Box>
  );
}
