/* global jest */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-secure-store', () => {
  const m = new Map();
  return {
    getItemAsync: jest.fn(async (k) => m.get(k) ?? null),
    setItemAsync: jest.fn(async (k, v) => void m.set(k, v)),
    deleteItemAsync: jest.fn(async (k) => void m.delete(k)),
  };
});
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
