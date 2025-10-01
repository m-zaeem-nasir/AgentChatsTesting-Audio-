import { useMemo, useRef } from "react";

/**
 * useWebSocket - Lightweight wrapper around native WebSocket
 *
 * @param {string} endpoint - WebSocket URL
 * @returns {object} API to control the socket
 *
 * API:
 *  - connect(): Promise<void>
 *  - disconnect(): void
 *  - onMessage(cb: (data: any) => void): void
 *  - sendAudio(buffer: ArrayBuffer | Blob): void
 *  - sendInterrupt(): void
 *  - isConnected: boolean
 */
export default function useWebSocket(endpoint) {
  const socketRef = useRef(null);
  const isConnectedRef = useRef(false);

  // Connect to the endpoint
  const connect = async () => {
    if (!endpoint) return;
    socketRef.current = new WebSocket(endpoint);

    socketRef.current.onopen = () => {
      isConnectedRef.current = true;
    };

    socketRef.current.onclose = () => {
      isConnectedRef.current = false;
    };

    return new Promise((resolve, reject) => {
      socketRef.current.onerror = reject;
      socketRef.current.onopen = resolve;
    });
  };

  // Disconnect the socket
  const disconnect = () => {
    if (socketRef.current) {
      socketRef.current.close();
      isConnectedRef.current = false;
    }
  };

  // Register a message handler
  const onMessage = (cb) => {
    if (socketRef.current) {
      socketRef.current.onmessage = (e) => cb(JSON.parse(e.data));
    }
  };

  // Send raw audio data
  const sendAudio = (audioBuffer) => {
    if (socketRef.current && isConnectedRef.current) {
      socketRef.current.send(audioBuffer);
    }
  };

  // Send a control message to stop the agent
  const sendInterrupt = () => {
    if (socketRef.current && isConnectedRef.current) {
      socketRef.current.send(JSON.stringify({ type: "interrupt" }));
    }
  };

  const isConnected = useMemo(() => isConnectedRef.current, [socketRef]);

  return { connect, disconnect, onMessage, sendAudio, sendInterrupt, isConnected };
}
