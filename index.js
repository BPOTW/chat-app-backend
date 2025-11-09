import express from "express";
import {Server} from "socket.io";
import http from "http";
import { text } from "stream/consumers";


const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors:{
        origin:"http://localhost:5173",
        method:["GET", "POST"],
        credentials:true,
    }
});


const users = [];
io.on("connection", (socket) => {
  console.log("Connected to websocket:", socket.id);

  socket.on("join", (chatData) => {
    // const { chatId, userId } = chatData;
    console.log("Joined chat:", chatData.chatId);

    // join the room
    socket.join(chatData.chatId);

    // notify everyone in the room (including the sender)
    // io.to(chatId).emit("joinedChat", { chatId, userId });
  });

  socket.on("leave", (roomId) => {
    socket.leave(roomId);
  });

  socket.on("send", (message) => {
    console.log(message);
    io.to(message.chatId).emit("message", {
        id:message.id,
        text:message.msg
    });
  });

  socket.on("register", async () => {
    const sockets = await io.fetchSockets();
    const socketIds = sockets.map((s) => s.id);
    users.length = 0;
    users.push(...socketIds);
    // console.log("User ids:", users);
  });

  socket.on("sendRequest", (data) => {
    // console.log("Send request:", data);
    socket.to(data.receiverId).emit("request", data.senderId);
  });

  socket.on("checkRoom", (data) => {
    const roomExists = io.sockets.adapter.rooms.has(data.roomId);
    console.log(roomExists);
    if (roomExists) {
        console.log(data.senderId)
      socket.emit("checkRoomResult", { id:data.roomId, isAvailable: true });
    } else {
      socket.emit("checkRoomResult", { id:data.roomId, isAvailable: false });
    }
  });

  socket.on("checkId", (id) => {
    if (users.includes(id)) {
      socket.emit("checkIdResult", { id, isAvailable: true });
    } else {
      socket.emit("checkIdResult", { id, isAvailable: false });
    }
  });
});


server.listen(5050,()=>{
    console.log('Server started successfully on port 5050');
})