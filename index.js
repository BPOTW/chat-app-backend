import express from "express";
import { connectDB } from "./utils/connectDB.js";
import router from "./routes/users.js";
import { Server } from "socket.io";
import http from "http";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());
const clientUrls = process.env.CLIENT_URLS
  ? process.env.CLIENT_URLS.split(",").map((s) => s.trim())
  : [process.env.CLIENT_URL || "http://localhost:5173"];
const corsMethods = process.env.CORS_METHODS
  ? process.env.CORS_METHODS.split(",").map((s) => s.trim())
  : ["GET", "POST"];
const corsCredentials = process.env.CORS_CREDENTIALS
  ? process.env.CORS_CREDENTIALS === "true"
  : true;

app.use(
  cors({
    origin: clientUrls,
    methods: corsMethods,
    credentials: corsCredentials,
  })
);

connectDB();

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: clientUrls,
    methods: corsMethods,
    credentials: corsCredentials,
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
    const userRooms = users.get(username).rooms || [];


    userRooms.forEach((roomId) => {
      if (rooms.has(roomId)) {
        const room = rooms.get(roomId);
        room.participants = room.participants.filter((u) => u !== username);
        rooms.set(roomId, room);


        io.to(roomId).emit("participants", room.participants);
      }
    });


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


    if (users.has(username)) {
      const user = users.get(username);
      const currentRooms = [...user.rooms]; 

      currentRooms.forEach((existingRoomId) => {

        socket.leave(existingRoomId);


        if (rooms.has(existingRoomId)) {
          const existingRoom = rooms.get(existingRoomId);
          existingRoom.participants = existingRoom.participants.filter(
            (u) => u !== username
          );
          rooms.set(existingRoomId, existingRoom);


          io.to(existingRoomId).emit("participants", existingRoom.participants);
        }
      });


      user.rooms = [];
      users.set(username, user);
    }


    socket.join(roomId);


    rooms.set(roomId, {
      ...roomData,
      roomId: roomId,
      participants: [roomData.adminId],
      createdAt: Date.now(),
    });


    if (users.has(username)) {
      const user = users.get(username);
      user.rooms = [roomId];
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


    if (rooms.has(roomId)) {

      if (users.has(joinerId)) {
        const user = users.get(joinerId);
        const currentRooms = [...user.rooms];

        currentRooms.forEach((existingRoomId) => {

          socket.leave(existingRoomId);


          if (rooms.has(existingRoomId)) {
            const existingRoom = rooms.get(existingRoomId);
            existingRoom.participants = existingRoom.participants.filter(
              (u) => u !== joinerId
            );
            rooms.set(existingRoomId, existingRoom);


            io.to(existingRoomId).emit(
              "participants",
              existingRoom.participants
            );
          }
        });


        user.rooms = [];
        users.set(joinerId, user);
      }


      socket.join(roomId);

      const room = rooms.get(roomId);


      if (!room.participants.includes(joinerId)) {
        room.participants.push(joinerId);
        rooms.set(roomId, room);
      }


      if (users.has(joinerId)) {
        const user = users.get(joinerId);
        user.rooms = [roomId]; 
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


    if (allRooms.length === 0) {
      socket.emit("joinRoomFailed", "No rooms available");
      return;
    }


    const randomRoomId = allRooms[Math.floor(Math.random() * allRooms.length)];
    const randomRoom = rooms.get(randomRoomId);

    console.log("Random room selected:", randomRoomId);


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


    socket.join(randomRoomId);


    if (!randomRoom.participants.includes(joinerId)) {
      randomRoom.participants.push(joinerId);
      rooms.set(randomRoomId, randomRoom);
    }


    if (users.has(joinerId)) {
      const user = users.get(joinerId);
      user.rooms = [randomRoomId];
      users.set(joinerId, user);
    }


    socket.emit("roomJoined", {
      roomId: randomRoomId,
      roomData: randomRoom,
      participants: randomRoom.participants,
    });


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

    const roomsArray = Array.from(rooms.values());

    socket.emit("ListOfRooms", roomsArray);
    console.log("Active rooms:", roomsArray);
  });

  socket.on("updateRoomData", (roomId, roomData) => {
    rooms.set(roomId,roomData);
  });


});

const PORT = process.env.PORT || 5050;
server.listen(PORT, () => {
  console.log(`Server started successfully on port ${PORT}`);
});
