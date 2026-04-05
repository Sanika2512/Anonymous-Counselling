const User = require("../models/User");

const connectedUsers = new Map();

module.exports = (io) => {
  io.on("connection", async (socket) => {
    console.log("New client connected:", socket.id);

    const { userId, role } = socket.handshake.auth;

    if (!userId || !role) {
      console.log("❌ No userId or role received");
      return;
    }

    const user = await User.findById(userId);
    if (!user) {
      console.log("❌ User not found");
      socket.disconnect();
      return;
    }

    socket.userId = userId;
    socket.userRole = role;
    socket.username = user.email;

    connectedUsers.set(userId.toString(), socket.id);
    socket.join(userId.toString());

    await User.findByIdAndUpdate(userId, {
      isOnline: true,
      socketId: socket.id,
      lastSeen: Date.now()
    });

    io.emit("online-users", Array.from(connectedUsers.keys()));
    io.emit("counselor-list-update");

    console.log(`✅ User ${socket.username} (${role}) connected`);

    // ================= JOIN CHAT ROOM =================
    socket.on("join-chat", (chatId) => {
      if (!socket.userId || !chatId) return;

      // Leave previous room
      if (socket.lastChatId && socket.lastChatId !== chatId) {
        socket.leave(socket.lastChatId);
        console.log(`Left chat ${socket.lastChatId}`);
      }

      socket.lastChatId = chatId;
      socket.join(chatId);
      console.log(`✅ ${role} joined chat room: ${chatId}`);
    });

    // ================= TYPING =================
    socket.on("typing", (payload) => {
      const chatId = typeof payload === "string" ? payload : payload?.chatId;
      if (!chatId) return;
      socket.to(chatId).emit("typing", {
        chatId,
        fromRole: socket.userRole,
        fromUserId: socket.userId
      });
    });

    // ================= DISCONNECT =================
    socket.on("disconnect", async () => {
      console.log("Client disconnected:", socket.id);

      if (socket.userId) {
        const currentSocketId = connectedUsers.get(socket.userId.toString());
        if (currentSocketId === socket.id) {
          await User.findByIdAndUpdate(socket.userId, {
            isOnline: false,
            lastSeen: Date.now()
          });
          connectedUsers.delete(socket.userId.toString());
          io.emit("online-users", Array.from(connectedUsers.keys()));
          io.emit("counselor-list-update");
        }
      }
    });
  });
};