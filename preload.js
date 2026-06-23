// Preload script for Orion Browser
// Exposes a safe IPC renderer API and utility helpers to the renderer process via contextBridge

const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');
const url = require('url');

// Whitelist of channels that are allowed to be used from the renderer
const allowedChannels = [
  'window-minimize',
  'window-maximize',
  'window-close',
  'window-state',
  'update-theme',
  // Add any other channels you need here
];

// Function to check if a channel is allowed
function isAllowed(channel) {
  return allowedChannels.includes(channel);
}

// Expose IPC renderer with validation
contextBridge.exposeInMainWorld('ipc', {
  send: (channel, ...args) => {
    if (!isAllowed(channel)) {
      throw new Error(`Channel ${channel} is not allowed`);
    }
    ipcRenderer.send(channel, ...args);
  },
  invoke: (channel, ...args) => {
    if (!isAllowed(channel)) {
      throw new Error(`Channel ${channel} is not allowed`);
    }
    return ipcRenderer.invoke(channel, ...args);
  },
  on: (channel, listener) => {
    if (!isAllowed(channel)) {
      throw new Error(`Channel ${channel} is not allowed for listeners`);
    }
    // Wrap listener to avoid issues with removal
    const wrappedListener = (...args) => listener(...args);
    ipcRenderer.on(channel, wrappedListener);
    // Return a function to remove the listener
    return () => ipcRenderer.removeListener(channel, wrappedListener);
  },
  removeListener: (channel, listener) => {
    if (!isAllowed(channel)) {
      throw new Error(`Channel ${channel} is not allowed`);
    }
    ipcRenderer.removeListener(channel, listener);
  }
});

// Utility helpers
contextBridge.exposeInMainWorld('utils', {
  // Returns the __dirname of the main process (i.e., the app directory)
  getDirName: () => __dirname,
  // Returns a file:// URL for a given relative path (from the app directory)
  getAssetPath: (relativePath) => {
    return url.format({
      protocol: 'file',
      slashes: true,
      pathname: path.join(__dirname, relativePath)
    });
  }
});