import axios from "axios";

const baseUrl = process.env.REACT_APP_AGENT_VOICE_ENDPOINT;

/**
 * Sends a heartbeat request to keep the session alive.
 *
 * @param {string} sessionId - The current session identifier.
 * @returns {Promise} Axios response promise.
 */
export async function SendHeartBeat(sessionId) {
  try {
    const url = `${baseUrl.replace("{session_id}", sessionId)}/heartbeat`;
    const response = await axios.post(url);
    return response;
  } catch (error) {
    console.error("Heartbeat error:", error);
    throw error;
  }
}

/**
 * Sends a beacon to signal that the client is exiting or has lost the page.
 *
 * @param {string} sessionId - The current session identifier.
 * @returns {Promise} Axios response promise.
 */
export async function SendBeacon(sessionId) {
  try {
    const url = `${baseUrl.replace("{session_id}", sessionId)}/beacon`;
    const response = await axios.post(url);
    return response;
  } catch (error) {
    console.error("Beacon error:", error);
    // Swallow error so the caller doesn't need to handle it
  }
}
