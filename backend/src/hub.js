// Pusat koneksi WebSocket: alat (ESP32-CAM) dan browser pengguna.
export const hub = {
  devices: new Map(), // deviceId -> { ws, ownerId }
  users: new Map(), // userId -> Set<ws>
  activeJobs: new Map(), // deviceId -> { jobId, kind, timer }

  isOnline(deviceId) {
    return this.devices.has(Number(deviceId));
  },

  onlineIds() {
    return [...this.devices.keys()];
  },

  sendToDevice(deviceId, message) {
    const entry = this.devices.get(Number(deviceId));
    if (!entry || entry.ws.readyState !== 1) return false;
    entry.ws.send(JSON.stringify(message));
    return true;
  },

  notifyUser(userId, message) {
    const sockets = this.users.get(Number(userId));
    if (!sockets) return;
    const data = JSON.stringify(message);
    for (const ws of sockets) if (ws.readyState === 1) ws.send(data);
  },

  addUser(userId, ws) {
    if (!this.users.has(userId)) this.users.set(userId, new Set());
    this.users.get(userId).add(ws);
  },

  removeUser(userId, ws) {
    const set = this.users.get(userId);
    if (!set) return;
    set.delete(ws);
    if (set.size === 0) this.users.delete(userId);
  },
};
