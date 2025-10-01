import { useState, useEffect, useRef } from "react";

export default function useAudioPlayer() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [queue, setQueue] = useState([]);
  const audioRef = useRef(new Audio());

  useEffect(() => {
    const audio = audioRef.current;
    audio.onended = () => {
      setIsPlaying(false);
      setQueue((q) => q.slice(1));
    };
    return () => audio.pause();
  }, []);

  const queueAudio = (arrayBuffer) => {
    setQueue((q) => [...q, arrayBuffer]);
    if (!isPlaying) {
      playNext();
    }
  };

  const playNext = () => {
    if (queue.length === 0) return;
    const buffer = queue[0];
    const blob = new Blob([buffer], { type: "audio/webm" });
    const url = URL.createObjectURL(blob);
    const audio = audioRef.current;
    audio.src = url;
    audio.play();
    setIsPlaying(true);
  };

  const stopAudio = () => {
    audioRef.current.pause();
    audioRef.current.src = "";
    setIsPlaying(false);
    setQueue([]);
  };

  return { isPlaying, queueAudio, stopAudio };
}
