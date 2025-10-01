import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import { Box, Typography, Switch } from "@mui/joy";
import PageLayout from "../../components/layout/PageLayout/pagelayout";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import MicIcon from "@mui/icons-material/Mic";
import MicOffIcon from "@mui/icons-material/MicOff";
import VolumeOffIcon from "@mui/icons-material/VolumeOff";
import CloseIcon from "@mui/icons-material/Close";
import { useLocation } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import IconButton from "../../components/common/iconButton";
import { larvanderGreen } from "../../styles/colors";
import AvatarTimer from "../../components/common/avatarTimer";
import VoiceAgentOrb from "../../components/orb/VoiceAgentOrb";
import "./agentChat.css";
import {
  useWebSocket,
  useAudioRecorder,
  useAudioPlayer,
} from "../../components/AudioStreaming/webSocket";
import DebugPanel, { useDebugLogger } from "../../components/common/DebugPanel";
import { Button } from "@mui/joy";
import Snackbar from "@mui/joy/Snackbar";
import { aiApi } from "../../services/api";
import { useAuth } from "../../contexts/AuthContext";
import { SendBeacon, SendHeartBeat } from "./voiceUtils";
import SessionLostPage from "../sessionLost/SessionLostPage";

export default function AgentChat() {
  const navigate = useNavigate();
  const location = useLocation();
  const { userProfile } = useAuth();
  const sessionId =
    location.state?.sessionId || sessionStorage.getItem("sessionId");
  const creditInfo = location.state?.creditInfo; // Only use creditInfo from navigation state, not storage
  const [displayName, setDisplayName] = useState("User");
  const [voiceOnly, setVoiceOnly] = useState(true);
  const [snackbarMessage, setSnackbarMessage] = useState("");
  const [showSnackbar, setShowSnackbar] = useState(false);
  const [debugEnabled, setDebugEnabled] = useState(false);
  const [agentSpeaking, setAgentSpeaking] = useState(false);
  const debugPanelRef = useRef(null);
  const logger = useDebugLogger(debugPanelRef);
  const [isRecording, setIsRecording] = useState(false);
  const [sessionValidated, setSessionValidated] = useState(false);
  const [sessionError, setSessionError] = useState(null);
  const [duration, setDuration] = useState(5); // Default to 5 minutes
  const [isConnected, setIsConnected] = useState(false);
  const [agentReady, setAgentReady] = useState(false);
  const heartbeatIntervalRef = useRef(null);

  const fetchSessionDuration = () => {
    if (sessionId) {
      aiApi
        .get(`/api/v1/voice-agent/session/${sessionId}/duration`)
        .then((response) => {
          if (
            response &&
            response.data &&
            typeof response.data.durationSeconds === "number"
          ) {
            setDuration(response.data.durationSeconds);
            logger.info(
              `Session duration fetched: ${response.data.durationSeconds} seconds`,
            );
          } else {
            logger.warn(
              "Invalid response structure when fetching session duration",
              response,
            );
          }
        })
        .catch((error) => {
          logger.error("Error fetching session duration", error);
        });
    }
  };

  const wsEndpoint = useMemo(() => {
    if (!sessionId) return null;
    const baseUrl = process.env.REACT_APP_AGENT_VOICE_ENDPOINT.replace(
      "{session_id}",
      sessionId,
    );
    return `${baseUrl}`;
  }, []);

  const websocket = useWebSocket(wsEndpoint);
  const audioRecorder = useAudioRecorder();
  const audioPlayer = useAudioPlayer();

  // Connection and UI state management
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const connectionAttemptRef = useRef(false);

  // Validate and Setting Display Name
  useEffect(() => {
    if (userProfile?.display_name) {
      const name = userProfile.display_name.split(" ", 1)[0];
      setDisplayName(name);
    } else {
      setDisplayName("User");
    }
  }, [userProfile]);

  // Validate session on mount
  useEffect(() => {
    const validateSession = async () => {
      try {
        // If we have session data from navigation state, store it for persistence
        if (location.state?.sessionId) {
          sessionStorage.setItem("sessionId", location.state.sessionId);
        }

        if (!sessionId) {
          setSessionError(
            "No active session found. Please start a new session.",
          );
          setTimeout(() => navigate("/dashboard"), 2000);
          return;
        }

        // If we have creditInfo from navigation, use it and set duration
        if (creditInfo?.max_session_duration_seconds) {
          setDuration(creditInfo.max_session_duration_seconds);
          setSessionValidated(true);
        } else {
          setSessionValidated(false);
        }
      } catch (error) {
        logger.error("Session validation error:", error);
        setSessionError("Failed to validate session. Please try again.");
        setTimeout(() => navigate("/dashboard"), 3000);
      }
    };

    validateSession();
  }, [sessionId, navigate, creditInfo, location.state, logger]);

  const showFeedback = useCallback((message) => {
    setSnackbarMessage(message);
    setShowSnackbar(true);
  }, []);

  const handleSessionError = useCallback(async () => {
    try {
      if (audioRecorder.isRecording) {
        await audioRecorder.stopRecording();
      }
      audioPlayer.stopAudio();
      websocket.disconnect();

      setAgentSpeaking(false);
      setIsRecording(false);
      setIsMuted(false);

      showFeedback("Session ended due to error");
      logger.info("Session terminated due to error");

      setTimeout(() => navigate("/dashboard"), 2000);
    } catch (error) {
      logger.error("Error during session cleanup", error);
    }
  }, [audioRecorder, audioPlayer, websocket, showFeedback, logger, navigate]);

  const handleWebSocketMessage = useCallback(
    (data) => {
      // logger.websocket('WebSocket message received', data);

      switch (data.type) {
        case "session_terminated":
          logger.info("Session terminated by server", data.reason);
          showFeedback(`Session ended: ${data.reason || "No reason provided"}`);
          handleSessionError();
          setIsConnected(false);
          break;

        case "status":
          if (data.message) {
            logger.info("Status message", data.message);
            showFeedback(`Agent: ${data.message}`);
          }
          break;

        case "transcription":
          if (data.transcript) {
            logger.transcription("Transcription received", data.transcript);
            // Only show in snackbar if debug is disabled
            if (!debugEnabled) {
              showFeedback(`You said: ${data.transcript}`);
            }
          }
          break;

        case "interrupted":
          console.log("Interruption acknowledged by server");
          break;

        case "audio":
          if (data.audio_data) {
            logger.info("Audio response received from agent");
            setAgentSpeaking(true);

            // Convert base64 audio data to ArrayBuffer
            const binaryString = atob(data.audio_data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }

            // Queue the audio for playback
            audioPlayer.queueAudio(bytes.buffer);

            if (!debugEnabled) {
              showFeedback(`🎙️ Agent is speaking...`);
            }
          }
          break;

        case "audio_end":
          logger.info("Agent finished speaking");
          setAgentSpeaking(false);
          if (!debugEnabled) {
            showFeedback(`✅ Agent finished speaking`);
          }
          break;

        case "connected":
          logger.info("WebSocket connected", data.data);
          showFeedback("Connected to agent");
          setIsConnected(true);
          setAgentReady(true);
          SendHeartBeat(sessionId);
          break;

        case "transcription_started":
          logger.info("Transcription started");
          if (!debugEnabled) {
            showFeedback("🎙️ Processing your speech...");
          }
          break;

        case "transcription_error":
          logger.error("Transcription error", data.data);
          showFeedback("⚠️ Speech processing error");
          break;

        case "processing":
          logger.info("Server processing speech", data.data);
          if (!debugEnabled) {
            showFeedback("🔄 Processing your request...");
          }
          break;

        case "response_start":
          logger.info("Agent response starting", data.data);
          if (!debugEnabled) {
            showFeedback("🤖 Agent is responding...");
          }
          break;

        case "tts_pipeline_start":
          logger.info("TTS pipeline started", data.data);
          setIsMuted(true); // To Avoid Interruption
          setAgentSpeaking(true);
          if (!debugEnabled) {
            showFeedback("🎙️ Agent is speaking...");
          }
          break;

        case "avatar_text_chunk":
          // Handle avatar text if needed in future
          break;

        case "audio_blob":
          logger.info("Audio blob received", data.blob);
          try {
            // Convert Blob to ArrayBuffer for audio playback
            data.blob.arrayBuffer().then((arrayBuffer) => {
              audioPlayer.queueAudio(arrayBuffer);
              logger.info("Audio blob queued for playback");
            });
          } catch (error) {
            logger.error("Error processing audio blob", error);
          }
          break;

        case "audio_chunk_ready":
          logger.info("Audio chunk ready signal received");
          // This message indicates audio is ready, the actual audio comes as Blob
          break;

        case "audio_pipeline_complete":
          logger.info("Audio pipeline completed");
          // Audio generation is complete
          break;

        case "response_end":
          logger.info("Agent response ended");
          setAgentSpeaking(false);
          if (!debugEnabled) {
            showFeedback(`✅ Agent finished speaking`);
          }
          break;

        case "error":
          if (data.error) {
            logger.error("WebSocket error", data.error);
            showFeedback(`Error: ${data.error}`);

            if (data.error === "Invalid or expired session ID") {
              handleSessionError();
            }
            setIsConnected(false);
          }
          break;

        default:
          logger.warn("Unknown message type", { type: data.type, data });
      }
    },
    [logger, debugEnabled, showFeedback, handleSessionError],
  );

  useEffect(() => {
    websocket.onMessage(handleWebSocketMessage);
  }, [websocket, handleWebSocketMessage]);

  // Track audio player state changes
  useEffect(() => {
    if (!audioPlayer.isPlaying && agentSpeaking) {
      // Agent finished speaking
      setAgentSpeaking(false);
    }
  }, [audioPlayer.isPlaying, agentSpeaking]);

  // WebSocket connection management - single connection guarantee
  useEffect(() => {
    if (
      connectionAttemptRef.current ||
      isConnecting ||
      websocket.isConnected ||
      !sessionId ||
      !wsEndpoint
    ) {
      return;
    }

    connectionAttemptRef.current = true;
    setIsConnecting(true);

    console.log("Initializing WebSocket connection...");
    websocket
      .connect()
      .then(() => {
        setIsConnecting(false);
        fetchSessionDuration();
      })
      .catch((error) => {
        console.error("Error Connecting to WebSocket:", error);
        showFeedback("Failed to connect to the agent");
        setIsConnecting(false);
        connectionAttemptRef.current = false;
      });
  }, [sessionId, wsEndpoint, websocket, showFeedback, isConnecting]);

  useEffect(() => {
    const handleOnUnload = (event) => {
      SendBeacon(sessionId);
      console.warn("Window unloaded, cleaning up session");
    };

    window.addEventListener("unload", handleOnUnload);

    // Cleanup function
    return () => {
      window.removeEventListener("unload", handleOnUnload);
    };
  }, [sessionId]);

  // Handle audio data with null buffer when muted
  useEffect(() => {
    const handleAudioData = (audioData) => {
      if (isMuted) {
        // Send null buffer when muted
        const nullBuffer = new ArrayBuffer(0);
        websocket.sendAudio(nullBuffer);
      } else {
        websocket.sendAudio(audioData);
      }
    };
    audioRecorder.onAudioData(handleAudioData);
  }, [audioRecorder, websocket, isMuted]);

  const handleMicToggle = useCallback(async () => {
    try {
      if (audioRecorder.isRecording) {
        // Mute/unmute microphone instead of stopping recording
        setIsMuted(!isMuted);
        if (!isMuted) {
          showFeedback("🔇 Microphone muted");
          logger.info("Microphone muted - sending null buffer");
        } else {
          showFeedback("🎤 Microphone unmuted");
          logger.info("Microphone unmuted");
        }
      } else {
        if (!isConnected || !agentReady) {
          showFeedback("⚠️ Agent not ready yet. Please wait...");
          return;
        }

        // Start recording
        await audioRecorder.startRecording(16000);
        setIsRecording(true);
        setIsMuted(false);
        showFeedback("🟢 Listening...");
        logger.info("Recording started");
      }
    } catch (error) {
      logger.error("Error toggling microphone", error);
      showFeedback("Error toggling microphone");
    }
  }, [audioRecorder, isMuted, showFeedback, logger]);

  const handleEndCall = useCallback(async () => {
    try {
      // Immediately stop agent speaking and reset states
      setAgentSpeaking(false);
      setIsRecording(false);
      setIsMuted(false);

      // Stop recording if active
      if (audioRecorder.isRecording) {
        await audioRecorder.stopRecording();
      }

      // Stop all audio and clear any queued audio
      audioPlayer.stopAudio();

      // // Send stop signal to WebSocket before disconnecting
      websocket.sendInterrupt();

      showFeedback("Agent Stopped Talking");
      logger.info("Agent Stopped Talking");
    } catch (error) {
      logger.error("Error ending call", error);
      showFeedback("Error ending call");
    }
  }, [
    audioRecorder,
    audioPlayer,
    websocket,
    logger,
    showFeedback,
    sessionId,
    navigate,
  ]);

  // Function to handle time logic
  const onTimeUp = useCallback(async () => {
    // Stop the ongoing session
    if (audioRecorder.isRecording) {
      await audioRecorder.stopRecording();
    }
    audioPlayer.stopAudio();
    setAgentSpeaking(false);
    setIsRecording(false);
    websocket.disconnect();

    showFeedback("Timer up! Session ended.");
    logger.timer("Time Up");
    try {
      SendBeacon(sessionId);
      logger.info("Session ended on backend");
      showFeedback("✅ Session ended successfully");
    } catch (error) {
      logger.warn("Failed to end session on backend", error);
      showFeedback("⚠️ Failed to end session on backend");
    } finally {
      setTimeout(() => navigate("/dashboard"), 2000);
    }
  }, [
    audioPlayer,
    audioRecorder,
    logger,
    navigate,
    sessionId,
    showFeedback,
    websocket,
  ]);

  // Audio system monitoring (for development)
  useEffect(() => {
    if (audioPlayer.setErrorCallback) {
      audioPlayer.setErrorCallback((error) => {
        logger.error("Audio System Error:", error);
        showFeedback(`🔴 Audio error: ${error.errorType}`);
      });
    }

    // Log audio stats periodically in debug mode
    if (debugEnabled) {
      const interval = setInterval(() => {
        if (audioPlayer.getAudioStats) {
          const stats = audioPlayer.getAudioStats();
          if (stats.activeStreams > 0) {
            console.log("🎵 Audio Stats:", stats);
          }
        }
      }, 5000);

      return () => clearInterval(interval);
    }
  }, [audioPlayer, logger, showFeedback, debugEnabled]);

  const onWarning = useCallback(
    (seconds, message) => {
      logger.timer(`Warning: ${message}`, { seconds });
      showFeedback(`⚠️ ${message}`);
    },
    [logger, showFeedback],
  );

  // Heartbeat management effect
  useEffect(() => {
    if (!isConnected || !sessionId) {
      return;
    }

    // Clear any existing interval
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
    }

    console.log("Starting heartbeat interval...");

    // Start heartbeat interval
    heartbeatIntervalRef.current = setInterval(() => {
      SendHeartBeat(sessionId)
        .then((response) => {
          if (response && response.data) {
            console.log("Heartbeat sent successfully", response.data);
          } else {
            console.warn("Invalid heartbeat response", response);
          }
        })
        .catch((error) => {
          console.error("Error sending heartbeat", error);
          // If heartbeat fails, consider the session as potentially lost
          if (
            error.response?.status === 404 ||
            error.response?.status === 401
          ) {
            console.warn("Session may be lost, stopping heartbeat");
            setIsConnected(false);
            setAgentReady(false);
          }
        });
    }, 12000);

    // Cleanup function
    return () => {
      if (heartbeatIntervalRef.current) {
        console.log("Clearing heartbeat interval");
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
    };
  }, [isConnected, sessionId]);

  // // Show loading while validating session or connecting
  // if ((!sessionValidated && !sessionError) || (sessionValidated && !agentReady && isConnecting)) {
  //     return (
  //         <PageLayout>
  //             <Box sx={{
  //                 display: 'flex',
  //                 flexDirection: 'column',
  //                 alignItems: 'center',
  //                 justifyContent: 'center',
  //                 minHeight: '60vh',
  //                 textAlign: 'center',
  //                 p: 4
  //             }}>
  //                 <Typography
  //                     level="h3"
  //                     sx={{
  //                         mb: 2,
  //                         color: 'primary.500',
  //                         fontFamily: 'Inter, sans-serif'
  //                     }}
  //                 >
  //                     {!sessionValidated ? 'Validating Session...' : 'Connecting to Agent...'}
  //                 </Typography>
  //                 <Typography
  //                     level="body1"
  //                     sx={{
  //                         mb: 3,
  //                         color: 'text.secondary',
  //                         maxWidth: '500px'
  //                     }}
  //                 >
  //                     {!sessionValidated ? 'Please wait while we validate your session.' : 'Establishing connection with your voice agent.'}
  //                 </Typography>
  //                 {/* Loading animation/spinner can be added here */}
  //                 <Box sx={{
  //                     width: '40px',
  //                     height: '40px',
  //                     border: '4px solid #e0e0e0',
  //                     borderTop: '4px solid #007fff',
  //                     borderRadius: '50%',
  //                     animation: 'spin 1s linear infinite',
  //                     '@keyframes spin': {
  //                         '0%': { transform: 'rotate(0deg)' },
  //                         '100%': { transform: 'rotate(360deg)' }
  //                     }
  //                 }} />
  //             </Box>
  //         </PageLayout>
  //     );
  // }

  // Show error state
  if (sessionError) {
    return (
      <PageLayout>
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "60vh",
            textAlign: "center",
            p: 4,
          }}
        >
          <Typography
            level="h3"
            sx={{
              mb: 2,
              color: "danger.500",
              fontFamily: "Inter, sans-serif",
            }}
          >
            Session Error
          </Typography>
          <Typography
            level="body1"
            sx={{
              mb: 3,
              color: "text.secondary",
              maxWidth: "500px",
            }}
          >
            {sessionError}
          </Typography>
          <Button
            variant="solid"
            sx={{
              backgroundColor: larvanderGreen,
              "&:hover": { backgroundColor: `${larvanderGreen}CC` },
            }}
            onClick={() => navigate("/dashboard")}
          >
            Return to Dashboard
          </Button>
        </Box>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <Box
        sx={{
          mr: { xs: "0.5rem", sm: "1rem", md: "1.5rem" },
          mt: { xs: "3rem", md: "2rem" },
          height: { xs: "calc(100vh - 3rem)", md: "calc(100vh - 2rem)" },
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            p: { xs: 1, sm: 2, md: 4 },
            flex: 1,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Header Section */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              mb: { xs: 2, sm: 3 },
              justifyContent: "space-between",
              flexDirection: { xs: "column", sm: "row" },
              gap: { xs: 2, sm: 0 },
            }}
          >
            <Typography
              startDecorator={
                <ArrowBackIcon
                  onClick={() => {
                    // Navigate back to dashboard instead of agent-persona
                    navigate("/dashboard");
                  }}
                  sx={{
                    fontSize: "1.8rem",
                    color: "neutral.500",
                    display: "none",
                    cursor: "pointer",
                    "&:hover": {
                      color: larvanderGreen,
                      transform: "scale(1.1)",
                    },
                    transition: "all 0.2s ease",
                  }}
                />
              }
              sx={{
                fontFamily: "Inter, sans-serif",
                fontWeight: 700,
                fontSize: { xs: "1.5rem", sm: "1.8rem", md: "1.8rem" },
                textAlign: { xs: "center", sm: "left" },
              }}
            >
              Hi {displayName}, let's chat!
            </Typography>
          </Box>

          {/* Main Chat Area */}
          <Box
            sx={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              // maxWidth: '600px',
              mx: "auto",
              width: "100%",
            }}
          >
            {/* Agent Video/Avatar Container */}
            <Box
              sx={{
                width: { xs: "80%", sm: "60%", md: "60%", lg: "60%" },
                height: "85%", //{ xs: '200px', sm: '400px', md: '400px', lg: '600px' },
                borderRadius: "20px",
                overflow: "hidden",
                mb: 4,
                position: "relative",
                // backgroundColor: 'neutral.100',
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {/* Conditional rendering based on voice-only toggle */}
              {voiceOnly ? (
                <Box
                  sx={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {/* Voice Agent Orb Animation  */}
                  {/* Based on the audio level from the microphone */}
                  <Box
                    sx={{
                      width: "100%",
                      height: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      position: "relative",
                      pointerEvents: "none",
                    }}
                  >
                    <VoiceAgentOrb
                      size={260}
                      opacity={
                        audioRecorder.isRecording || agentSpeaking ? 0.9 : 0.6
                      }
                      // animationTimer={0.0002}
                      animationTimer={
                        audioRecorder.isRecording
                          ? 0.002 + audioRecorder.audioLevel * 0.00001
                          : agentSpeaking
                            ? 0.003 + audioPlayer.agentAudioLevel * 0.00002
                            : 0.001
                      }
                    />
                  </Box>

                  {/*<AvatarTimer*/}
                  {/*    onTimeUp={onTimeUp}*/}
                  {/*    onWarning={onWarning}*/}
                  {/*    initialMinutes={duration > 0 ? Math.min(Math.ceil(duration / 60), 1) : 5}*/}
                  {/*/>*/}
                </Box>
              ) : (
                <Box
                  sx={{
                    width: "100%",
                    height: "100%",
                    backgroundColor: "#f0f0f0",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "white",
                  }}
                >
                  <Typography
                    level="h4"
                    sx={{ fontFamily: "Inter, sans-serif", opacity: 0.8 }}
                  >
                    Agent Video Feed
                  </Typography>
                  {/* Timer in top right */}

                  {/*<AvatarTimer*/}
                  {/*    onTimeUp={onTimeUp}*/}
                  {/*    onWarning={onWarning}*/}
                  {/*    initialMinutes={duration > 0 ? Math.min(Math.ceil(duration / 60), 1) : 5}*/}
                  {/*/>*/}
                </Box>
              )}
            </Box>

            {/* Control Buttons */}
            <Box
              sx={{
                display: "flex",
                gap: 3,
                mb: 4,
                alignItems: "center",
              }}
            >
              {/* Microphone Button */}
              {/* Microphone Button */}
              <IconButton
                onClick={handleMicToggle}
                sx={{
                  width: 56,
                  height: 56,
                  borderRadius: "50%",
                  color: "white",
                  backgroundColor: agentSpeaking
                    ? "#f59e0b"
                    : !isMuted
                      ? "#dc2626"
                      : "#16a34a",
                  "&:hover": {
                    bgcolor: agentSpeaking
                      ? "#d97706"
                      : audioRecorder.isRecording
                        ? "#b91c1c"
                        : "#15803d",
                    transform: "scale(1.05)",
                  },
                  transition: "all 0.2s ease",
                  border: agentSpeaking
                    ? "2px solid #fbbf24"
                    : !isMuted
                      ? "2px solid #86efac"
                      : "2px solid #fca5a5",
                }}
                title={
                  agentSpeaking
                    ? "Interrupt Agent"
                    : audioRecorder.isRecording
                      ? "Stop Recording"
                      : "Start Recording"
                }
              >
                {agentSpeaking ? (
                  <VolumeOffIcon sx={{ fontSize: "1.5rem" }} />
                ) : !isMuted ? (
                  <MicIcon sx={{ fontSize: "1.5rem" }} />
                ) : (
                  <MicOffIcon sx={{ fontSize: "1.5rem" }} />
                )}
              </IconButton>

              {/* End Call Button */}
              <IconButton
                onClick={handleEndCall}
                sx={{
                  width: 56,
                  height: 56,
                  borderRadius: "50%",
                  bgcolor: "#dc2626",
                  color: "white",
                  border: "2px solid #fca5a5",
                  "&:hover": {
                    bgcolor: "#b91c1c",
                    transform: "scale(1.05)",
                    boxShadow: "0 4px 12px rgba(220, 38, 38, 0.4)",
                  },
                  transition: "all 0.2s ease",
                }}
              >
                <CloseIcon sx={{ fontSize: "1.5rem" }} />
              </IconButton>
            </Box>

            {/* Voice Only Toggle */}
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 2,
                mb: 2,
              }}
            >
              <Typography level="body-md" sx={{ fontWeight: 500 }}>
                Voice Only
              </Typography>
              <Switch
                id="voice-only-toggle"
                slotProps={{
                  track: {
                    children: (
                      <React.Fragment>
                        <Typography
                          component="span"
                          level="inherit"
                          sx={{ ml: "10px" }}
                        >
                          On
                        </Typography>
                        <Typography
                          component="span"
                          level="inherit"
                          sx={{ mr: "8px" }}
                        >
                          Off
                        </Typography>
                      </React.Fragment>
                    ),
                  },
                }}
                checked={voiceOnly}
                onChange={(e) => {
                  setVoiceOnly(e.target.checked);
                  if (e.target.checked) {
                    showFeedback("🎵 Voice-only mode enabled");
                  } else {
                    showFeedback("📹 Video mode enabled");
                  }
                }}
                sx={{
                  "--Switch-thumbSize": "27px",
                  "--Switch-trackWidth": "64px",
                  "--Switch-trackHeight": "31px",
                  "--Switch-trackBackgroundColor": larvanderGreen,
                }}
              />
            </Box>

            {/* Debug Toggle */}
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 2,
                mb: 1,
              }}
            >
              <Typography
                level="body-sm"
                sx={{ fontWeight: 500, color: "text.secondary" }}
              >
                Debug Logs
              </Typography>
              <Switch
                size="sm"
                checked={debugEnabled}
                onChange={(e) => {
                  setDebugEnabled(e.target.checked);
                  logger.info(
                    `Debug mode ${e.target.checked ? "enabled" : "disabled"}`,
                  );
                }}
                sx={{
                  "--Switch-thumbSize": "20px",
                  "--Switch-trackWidth": "48px",
                  "--Switch-trackHeight": "24px",
                  "--Switch-trackBackgroundColor": larvanderGreen,
                }}
              />
            </Box>
          </Box>
        </Box>
      </Box>

      {/*Feedback Snackbar */}
      <Snackbar
        variant="soft"
        color={
          snackbarMessage.includes("Error")
            ? "danger"
            : snackbarMessage.includes("Warning")
              ? "warning"
              : "success"
        }
        open={showSnackbar}
        onClose={() => setShowSnackbar(false)}
        autoHideDuration={1000}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        sx={{
          position: "fixed",
          top: { xs: "20px", sm: "auto" },
          bottom: { xs: "auto", sm: "20px" },
          right: { xs: "16px", sm: "20px" },
          width: { xs: "calc(100% - 32px)", sm: "auto" },
          maxWidth: { xs: "none", sm: "400px" },
          minWidth: { sm: "300px" },
          zIndex: 10001,
          // Override default positioning on mobile
          transform: {
            xs: "translateX(-50%) translateY(0px) !important",
            sm: "none !important",
          },
          left: { xs: "50%", sm: "auto" },
          "& .MuiSnackbar-root": {
            fontSize: { xs: "0.875rem", sm: "0.9rem" },
            padding: { xs: "12px 16px", sm: "16px 20px" },
          },
        }}
        // startDecorator={<PlaylistAddCheckCircleRoundedIcon />}
        endDecorator={
          <Button
            onClick={() => setShowSnackbar(false)}
            size="sm"
            variant="soft"
            color={
              snackbarMessage.includes("Error")
                ? "danger"
                : snackbarMessage.includes("Warning")
                  ? "warning"
                  : "success"
            }
            sx={{
              fontSize: { xs: "0.8rem", sm: "0.875rem" },
              minHeight: { xs: "28px", sm: "32px" },
              px: { xs: 1.5, sm: 2 },
            }}
          >
            Dismiss
          </Button>
        }
      >
        {snackbarMessage}
      </Snackbar>

      {/* Debug Panel */}
      <DebugPanel
        ref={debugPanelRef}
        enabled={debugEnabled}
        onToggle={setDebugEnabled}
        position="bottom-right"
        maxLogs={50}
      />
    </PageLayout>
  );
}
