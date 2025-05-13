import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();
app.use(cors());

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
  },
});

const rooms = {}; // roomId => [userIds]

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Join room event
  socket.emit("socket-id", socket.id);
  socket.on("join-room", (roomId, userId) => {
    socket.join(roomId);
    console.log(`User ${userId} joined room ${roomId}`);
    if (!rooms[roomId]) rooms[roomId] = [];
    if (!rooms[roomId].includes(userId)) {
      rooms[roomId].push(userId); // Ensure user is only added once
    }

    // Send existing users to the new user
    const otherUsers = rooms[roomId].filter((id) => id !== userId);
    socket.emit("all-users", otherUsers);

    // Notify others that a new user joined
    socket.to(roomId).emit("user-connected", userId);

    // Handle disconnect
    socket.on("disconnect", () => {
      console.log(`User ${userId} disconnected`);
      rooms[roomId] = rooms[roomId].filter((id) => id !== userId);

      // If the room is empty, delete it
      if (rooms[roomId].length === 0) {
        delete rooms[roomId];
      }

      socket.to(roomId).emit("user-disconnected", userId);
    });

    // Relay signaling data
    socket.on("signal", ({ to, from, signal }) => {
      io.to(to).emit("signal", { from, signal });
    });

    // Relay ICE candidates
    socket.on("ice-candidate", ({ to, from, candidate }) => {
      io.to(to).emit("ice-candidate", { from, candidate });
    });
  });
});

server.listen(3001, () => {
  console.log("Server running on port 3001");
});
