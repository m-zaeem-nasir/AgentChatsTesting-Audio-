import { useState, useEffect, useCallback, useRef } from "react";

export default function useAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [audioData, setAudioData] = useState(null);
  const recorderRef = useRef(null);

  const startRecording = useCallback(async (sampleRate = 16000) => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { sampleRate },
    });
    recorderRef.current = new MediaRecorder(stream);
    const chunks = [];
    recorderRef.current.ondataavailable = (e) => chunks.push(e.data);
    recorderRef.current.onstop = () => {
      const blob = new Blob(chunks, { type: "audio/webm" });
      setAudioData(blob);
    };
    recorderRef.current.start();
    setIsRecording(true);
  }, []);

  const stopRecording = useCallback(async () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
      setIsRecording(false);
    }
  }, []);

  const onAudioData = (cb) => {
    if (recorderRef.current) {
      recorderRef.current.ondataavailable = cb;
    }
  };

  return { isRecording, audioData, startRecording, stopRecording, onAudioData };
}
