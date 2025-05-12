// src/components/VideoChat.jsx
import React, { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { io } from "socket.io-client";

const socket = io("http://localhost:3001");
const VideoCall = () => {
  const { roomId } = useParams();
  const localVideoRef = useRef(null);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState([]);
  const peersRef = useRef({});

  useEffect(() => {
    const init = async () => {
      // 1. Get media stream
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      console.log("Init", stream);
      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      console.log(socket);
      // 2. Join the room
      socket.emit("join-room", roomId, socket.id);
      console.log("RoomId", roomId, socket.id);
      // 3. Handle existing users
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

      // 4. Handle new user joining
      socket.on("user-connected", async (userId) => {
        const pc = createPeerConnection(userId, stream);
        peersRef.current[userId] = pc;
      });

      // 5. Handle signal (offer/answer)
      socket.on("signal", async ({ from, signal }) => {
        let pc = peersRef.current[from];

        if (!pc) {
          pc = createPeerConnection(from, stream);
          peersRef.current[from] = pc;
        }

        if (signal.type === "offer") {
          console.log(`Creating answer for user ${from}`);

          await pc.setRemoteDescription(new RTCSessionDescription(signal));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          socket.emit("signal", {
            to: from,
            from: socket.id,
            signal: pc.localDescription,
          });
        } else if (signal.type === "answer") {
          await pc.setRemoteDescription(new RTCSessionDescription(signal));
        }
      });

      // 6. Handle ICE candidates
      socket.on("ice-candidate", ({ from, candidate }) => {
        const pc = peersRef.current[from];
        if (pc && candidate) {
          pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
      });

      // 7. Handle user disconnect
      socket.on("user-disconnected", (userId) => {
        if (peersRef.current[userId]) {
          peersRef.current[userId].close();
          delete peersRef.current[userId];
          setRemoteStreams((prev) =>
            prev.filter((stream) => stream.id !== userId)
          );
        }
      });
    };

    init();

    return () => {
      socket.disconnect();
    };
  }, [roomId]);

  const createPeerConnection = (userId, stream) => {
    const pc = new RTCPeerConnection();
    console.log(`Creating PeerConnection for user ${userId}`);
    pc.oniceconnectionstatechange = () => {
      console.log("ICE state:", pc.iceConnectionState);
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
      console.log("Received remote stream from user:", userId); // ✅ Debug log
      setRemoteStreams((prev) => {
        const exists = prev.some((s) => s.id === userId);
        if (!exists) {
          console.log("Adding remote stream", remoteStream); // ✅ Debug log
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
              console.log(`Video stream for user ${id} added`); // ✅ Debug log
            }
          }}
        />
      ))}
    </div>
  );
};

export default VideoCall;
