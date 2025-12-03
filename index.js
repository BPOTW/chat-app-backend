import express from "express";
import { connectDB } from "./utils/connectDB.js";
import router from "./routes/users.js";
import { Server } from "socket.io";
import http from "http";
import cors from "cors";

const app = express();
app.use(express.json());
app.use(
  cors({
    origin: ["http://localhost:5173"],
    methods: ["GET", "POST"],
  })
);

connectDB();

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173"],
    method: ["GET", "POST"],
    credentials: true,
  },
});

let users = new Map();
// {
  //   'username1' = {
    //     socketId: 'abc123',
    //     private: false,
    //     invite: true,
    //     saveChat: true,
    //     rooms: ['room1']
    //   }
    // }
    
let rooms = new Map();
// {
  //   'room1' = {
    //     roomId: 'room1',
    //     name: 'General Chat',
//     adminId: 'username1',
//     private: false,
//     createdAt: 1234567890,
//     participants: ['username1']
//   },
// }


app.use("/", router);

app.post("/check-room", (req, res) => {
    const roomId = String(req.body.roomname).trim();
    const exists = rooms.has(roomId);
    res.json({ exists });
});


io.on("connection", async (socket) => {
  socket.on("disconnect", () => {
    const username = socket.username;

    if (!username || !users.has(username)) return;

    // Get user's rooms
    const userRooms = users.get(username).rooms || [];

    // Remove user from each room's participant list
    userRooms.forEach((roomId) => {
      if (rooms.has(roomId)) {
        const room = rooms.get(roomId);
        room.participants = room.participants.filter((u) => u !== username);
        rooms.set(roomId, room);

        // Notify remaining participants
        io.to(roomId).emit("participants", room.participants);
      }
    });

    // Remove user from users map
    users.delete(username);

    console.log("User disconnected:", username);
    console.log("Active rooms:", Array.from(rooms.keys()));
  });

  socket.on("setUsername", (username, data) => {
    socket.username = username;

    users.set(username, {
      socketId: socket.id,
      ...data,
      rooms: users.has(username) ? users.get(username).rooms : [],
    });
  });

  socket.on("leaveRoom", (roomId) => {
    console.log("leaving room", roomId);
    const username = socket.username;
    if (!username) return;

    socket.leave(roomId);
    console.log("2");
    if (users.has(username)) {
      const user = users.get(username);
      user.rooms = user.rooms.filter((r) => r !== roomId);
      users.set(username, user);
    }
    console.log("2");
    if (rooms.has(roomId)) {
      const room = rooms.get(roomId);
      room.participants = room.participants.filter((u) => u !== username);
      rooms.set(roomId, room);
      console.log("updated rooms partcipants", rooms);
      io.to(roomId).emit("participants", room.participants);
    }
  });

  socket.on("sendMessage", (messageData) => {
    io.to(messageData["roomId"]).emit("message", messageData);
  });

  socket.on("sendRequest", (data) => {
    if (users.has(data.receiverId)) {
      const receiverSocketId = users.get(data.receiverId).socketId;
      socket.to(receiverSocketId).emit("request", data.senderId, data.roomId);
    }
  });

  socket.on("createRoom", (roomId, roomData) => {
    const username = socket.username;

    // First, remove user from all existing rooms
    if (users.has(username)) {
      const user = users.get(username);
      const currentRooms = [...user.rooms]; // Copy array to avoid modification during iteration

      currentRooms.forEach((existingRoomId) => {
        // Leave the socket room
        socket.leave(existingRoomId);

        // Remove user from room's participants
        if (rooms.has(existingRoomId)) {
          const existingRoom = rooms.get(existingRoomId);
          existingRoom.participants = existingRoom.participants.filter(
            (u) => u !== username
          );
          rooms.set(existingRoomId, existingRoom);

          // Notify remaining participants
          io.to(existingRoomId).emit("participants", existingRoom.participants);
        }
      });

      // Clear user's rooms array
      user.rooms = [];
      users.set(username, user);
    }

    // Now join the new room
    socket.join(roomId);

    // Create room with admin as first participant
    rooms.set(roomId, {
      ...roomData,
      roomId: roomId,
      participants: [roomData.adminId],
      createdAt: Date.now(),
    });

    // Add room to user's rooms array
    if (users.has(username)) {
      const user = users.get(username);
      user.rooms = [roomId]; // Only this room
      users.set(username, user);
    }

    const room = rooms.get(roomId);
    io.to(roomId).emit("roomCreated", {
      roomId: roomId,
      roomData: room,
      participants: room.participants,
    });
  });

  socket.on("joinRoom", (roomId, joinerId) => {
    console.log("Attempting to join room:", roomId, "by user:", joinerId);

    // Check if room exists
    if (rooms.has(roomId)) {
      // First, remove user from all existing rooms
      if (users.has(joinerId)) {
        const user = users.get(joinerId);
        const currentRooms = [...user.rooms]; // Copy array to avoid modification during iteration

        currentRooms.forEach((existingRoomId) => {
          // Leave the socket room
          socket.leave(existingRoomId);

          // Remove user from room's participants
          if (rooms.has(existingRoomId)) {
            const existingRoom = rooms.get(existingRoomId);
            existingRoom.participants = existingRoom.participants.filter(
              (u) => u !== joinerId
            );
            rooms.set(existingRoomId, existingRoom);

            // Notify remaining participants in old room
            io.to(existingRoomId).emit(
              "participants",
              existingRoom.participants
            );
          }
        });

        // Clear user's rooms array
        user.rooms = [];
        users.set(joinerId, user);
      }

      // Now join the new room
      socket.join(roomId);

      const room = rooms.get(roomId);

      // Add user to room's participants if not already there
      if (!room.participants.includes(joinerId)) {
        room.participants.push(joinerId);
        rooms.set(roomId, room);
      }

      // Add room to user's rooms array
      if (users.has(joinerId)) {
        const user = users.get(joinerId);
        user.rooms = [roomId]; // Only this room
        users.set(joinerId, user);
      }

      socket.emit("roomJoined", {
        roomId: roomId,
        roomData: room,
        participants: room.participants,
      });
      console.log(rooms);
      io.to(roomId).emit("participants", room.participants);
    } else {
      console.log("Room not found:", roomId);
      socket.emit("joinRoomFailed", "Room does not exist");
    }
  });

  socket.on("joinRandomRoom", (joinerId) => {
    console.log("User wants to join a random room:", joinerId);

    const allRooms = Array.from(rooms.keys());

    // No rooms available
    if (allRooms.length === 0) {
      socket.emit("joinRoomFailed", "No rooms available");
      return;
    }

    // Pick a random room
    const randomRoomId = allRooms[Math.floor(Math.random() * allRooms.length)];
    const randomRoom = rooms.get(randomRoomId);

    console.log("Random room selected:", randomRoomId);

    // First remove user from all other rooms (same logic as joinRoom)
    if (users.has(joinerId)) {
      const user = users.get(joinerId);
      const currentRooms = [...user.rooms];

      currentRooms.forEach((existingRoomId) => {
        socket.leave(existingRoomId);

        if (rooms.has(existingRoomId)) {
          const oldRoom = rooms.get(existingRoomId);
          oldRoom.participants = oldRoom.participants.filter(
            (u) => u !== joinerId
          );
          rooms.set(existingRoomId, oldRoom);

          io.to(existingRoomId).emit("participants", oldRoom.participants);
        }
      });

      user.rooms = [];
      users.set(joinerId, user);
    }

    // Now join the random room
    socket.join(randomRoomId);

    // Add user to participants
    if (!randomRoom.participants.includes(joinerId)) {
      randomRoom.participants.push(joinerId);
      rooms.set(randomRoomId, randomRoom);
    }

    // Update user's joined rooms list
    if (users.has(joinerId)) {
      const user = users.get(joinerId);
      user.rooms = [randomRoomId];
      users.set(joinerId, user);
    }

    // Send exact same data as normal joinRoom
    socket.emit("roomJoined", {
      roomId: randomRoomId,
      roomData: randomRoom,
      participants: randomRoom.participants,
    });

    // Notify entire room about updated participants
    io.to(randomRoomId).emit("participants", randomRoom.participants);

    console.log("User joined random room:", randomRoomId, randomRoom.participants);
  });

  socket.on("checkRoom", (data) => {
    const roomExists = rooms.has(data.roomId);
    socket.emit("checkRoomResult", {
      id: data.roomId,
      isAvailable: roomExists,
    });
  });

  socket.on("checkId", (username) => {
    if (users.has(username) && !users.get(username).private) {
      socket.emit("checkIdResult", { username, isAvailable: true });
    } else {
      socket.emit("checkIdResult", { username, isAvailable: false });
    }
  });

  socket.on("updateUser", (username, data) => {
    if (users.has(username)) {
      const user = users.get(username);
      users.set(username, {
        ...user,
        ...data,
        socketId: socket.id,
      });
    }
  });

  socket.on("giveListOfRooms", () => {
    // Convert Map to Array of room objects
    const roomsArray = Array.from(rooms.values());

    socket.emit("ListOfRooms", roomsArray);
    console.log("Active rooms:", roomsArray);
  });

  socket.on("updateRoomData", (roomId, roomData) => {
    rooms.set(roomId,roomData);
  });


});

server.listen(5050, () => {
  console.log("Server started successfully on port 5050");
});
