let ioInstance = null;

function setIo(io) {
  ioInstance = io;
}

function getIo() {
  return ioInstance;
}

function emitSocketEvent(eventName, payload) {
  if (!ioInstance) {
    return false;
  }

  ioInstance.emit(eventName, payload);
  return true;
}

module.exports = {
  setIo,
  getIo,
  emitSocketEvent,
};
