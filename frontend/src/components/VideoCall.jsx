// src/components/VideoChat.jsx
import React, { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { io } from "socket.io-client";

const socket = io("http://localhost:3001");
console.log('clg:', socket);
const VideoCall = () => {
  const { roomId } = useParams();
  const localVideoRef = useRef(null);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState([]);
  const peersRef = useRef({});
  
  useEffect(() => {
    socket.connect()
    const init = async () => {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      console.log("Init local stream", stream);
      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      socket.on("all-users", async (users) => {
        users.forEach(async (userId) => {
          const pc = createPeerConnection(userId, stream);
          peersRef.current[userId] = pc;

          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);

          socket.emit("signal", {
            to: userId,
            from: socket.id,
            signal: offer,
          });
        });
      });

      socket.on("user-connected", async (userId) => {
        const pc = createPeerConnection(userId, stream);
        peersRef.current[userId] = pc;
      });

      socket.on("signal", async ({ from, signal }) => {
        let pc = peersRef.current[from];

        if (!pc) {
          pc = createPeerConnection(from, stream);
          peersRef.current[from] = pc;
        }

        if (signal.type === "offer") {
          if (pc.signalingState !== "stable") {
            console.warn("Skipping duplicate offer, already in stable state");
            return;
          }

          await pc.setRemoteDescription(new RTCSessionDescription(signal));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          socket.emit("signal", {
            to: from,
            from: socket.id,
            signal: pc.localDescription,
          });

          // Drain queued ICE candidates
          if (pc._queuedCandidates?.length) {
            for (const candidate of pc._queuedCandidates) {
              await pc.addIceCandidate(new RTCIceCandidate(candidate));
            }
            pc._queuedCandidates = [];
          }
        } else if (signal.type === "answer") {
          await pc.setRemoteDescription(new RTCSessionDescription(signal));

          // Drain queued ICE candidates
          if (pc._queuedCandidates?.length) {
            for (const candidate of pc._queuedCandidates) {
              await pc.addIceCandidate(new RTCIceCandidate(candidate));
            }
            pc._queuedCandidates = [];
          }
        }
      });

      socket.on("ice-candidate", async ({ from, candidate }) => {
        const pc = peersRef.current[from];
        if (pc && candidate) {
          if (pc.remoteDescription && pc.remoteDescription.type) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(candidate));
              console.log("ICE candidate added");
            } catch (err) {
              console.error("Failed to add ICE candidate", err);
            }
          } else {
            console.warn(
              "Remote description not ready. Queuing ICE candidate."
            );
            if (!pc._queuedCandidates) pc._queuedCandidates = [];
            pc._queuedCandidates.push(candidate);
          }
        }
      });

      socket.on("user-disconnected", (userId) => {
        if (peersRef.current[userId]) {
          peersRef.current[userId].close();
          delete peersRef.current[userId];
          setRemoteStreams((prev) =>
            prev.filter((streamObj) => streamObj.id !== userId)
          );
        }
      });
    };

    init();

    return () => {
      socket.disconnect();
    };
  }, [roomId]);

  useEffect(() => {
    if (socketId && roomId) {
      socket.emit("join-room", roomId, socketId);
      console.log("Joining room:", roomId, "as", socketId);
    }
  }, [socketId, roomId]);

  const createPeerConnection = (userId, stream) => {
    const pc = new RTCPeerConnection();

    console.log(`Creating PeerConnection for user ${userId}`);

    pc.onsignalingstatechange = () => {
      console.log("Signaling state:", pc.signalingState);
    };

    pc.oniceconnectionstatechange = () => {
      console.log("ICE connection state:", pc.iceConnectionState);
    };

    pc.onconnectionstatechange = () => {
      console.log("Peer connection state:", pc.connectionState);
    };

    stream.getTracks().forEach((track) => {
      pc.addTrack(track, stream);
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("ice-candidate", {
          to: userId,
          from: socket.id,
          candidate: event.candidate,
        });
      }
    };

    pc.ontrack = (event) => {
      const remoteStream = event.streams[0];
      console.log("Received remote stream from user:", userId);

      setRemoteStreams((prev) => {
        const exists = prev.some((s) => s.id === userId);
        if (!exists) {
          console.log("Adding remote stream", remoteStream);
          return [...prev, { id: userId, stream: remoteStream }];
        }
        return prev;
      });
    };

    return pc;
  };

  return (
    <div className="video-grid">
      <video ref={localVideoRef} autoPlay muted playsInline className="video" />
      {remoteStreams.map(({ id, stream }) => (
        <video
          key={id}
          autoPlay
          playsInline
          className="video"
          ref={(video) => {
            if (video && stream) {
              video.srcObject = stream;
              console.log(`Video stream for user ${id} added`);
            }
          }}
        />
      ))}
    </div>
  );
};

export default VideoCall;
