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
    origin: "*",
    methods: ["GET", "POST"],
  })
);

connectDB();

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    method: ["GET", "POST"],
    credentials: true,
  },
});

app.use("/", router);

let users = new Map();
let roomUsers = new Map();
// {
//   'roomid':[users]
// }
let userRooms = new Map();
// {
//   'userId':[rooms]
// }
let rooms = new Map();

io.on("connection", async (socket) => {
  console.log("Connected to websocket:", socket.id);

  socket.on("disconnect", () => {
    console.log("disconnected", socket.id, socket.username);
    users.delete(socket.username);

    const rooms = userRooms.get(socket.username) || [];
    console.log("User left rooms:", rooms);
    rooms.forEach(roomId => {
        roomUsers.set(roomId, (roomUsers.get(roomId) || []).filter((ru) => ru !== socket.username));
        io.to(roomId).emit("participants", roomUsers.get(roomId));
    });
    console.log(roomUsers);
    userRooms.delete(socket.username);
    
  });

  socket.on("setUsername", (username) => {
    socket.username = username;
    users.set(username, socket.id);
    if(!userRooms.has(username)){
      userRooms.set(username,[]);
    }
  });

  // socket.on("joinChat", (data) => {
  //   console.log(data);
  //   socket.join(data.chatId);
  //   if (!roomUsers.includes(data.userId)) {
  //     roomUsers.push(data.userId);
  //   }
  //   console.log(roomUsers);
  //   io.to(data.chatId).emit("joinedChat", data.userId);
  //   io.to(data.chatId).emit("participants", roomUsers);
  // });

  socket.on("leave", (roomId) => {
    socket.leave(roomId);
  });

  socket.on("sendMessage", (messageData) => {
    console.log(messageData["roomId"]);
    io.to(messageData["roomId"]).emit("message", messageData);
  });

  socket.on("checkRoom", (roomName) => {
    const isInRoom = socket.rooms.has(roomName);
    socket.emit("checkRoomResult", { roomName, isInRoom });
  });

  socket.on("register", async () => {
    const sockets = await io.fetchSockets();
    const socketIds = sockets.map((s) => s.id);
    users.length = 0;
    users.push(...socketIds);
  });

  socket.on("sendRequest", (data) => {
    // console.log(data);
    socket
      .to(users.get(data.receiverId))
      .emit("request", data.senderId, data.roomId);
  });

  socket.on("createRoom", (roomId, roomData) => {
    socket.join(roomId);
    rooms.set(roomId, roomData);
    roomUsers.set(roomId, [roomData["adminId"]]);
    userRooms.get(socket.username).push(roomId);
    io.to(roomId).emit("roomCreated", {
      roomId: roomId,
      roomData: roomData,
      participants: roomUsers.get(roomId),
    });
  });

  socket.on("joinRoom", (roomId, joinerId) => {
    socket.join(roomId);
    roomUsers.set(roomId, [...(roomUsers.get(roomId) || []), joinerId]);
    userRooms.get(socket.username).push(roomId);
    socket.emit("roomJoined", {
      roomId: roomId,
      roomData: rooms.get(roomId),
      participants: [roomUsers.get(roomId)],
    });
    io.to(roomId).emit("participants", roomUsers.get(roomId));
    // socket.to(users.get(data.receiverId)).emit("request", data.senderId);
  });

  socket.on("checkRoom", (data) => {
    const roomExists = io.sockets.adapter.rooms.has(data.roomId);
    if (roomExists) {
      socket.emit("checkRoomResult", { id: data.roomId, isAvailable: true });
    } else {
      socket.emit("checkRoomResult", { id: data.roomId, isAvailable: false });
    }
  });

  socket.on("checkId", (username) => {
    if (users.has(username)) {
      socket.emit("checkIdResult", { username, isAvailable: true });
    } else {
      socket.emit("checkIdResult", { username, isAvailable: false });
    }
  });
});

server.listen(5050, () => {
  console.log("Server started successfully on port 5050");
});
