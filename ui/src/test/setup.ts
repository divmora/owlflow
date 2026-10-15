import '@testing-library/jest-dom/vitest';

// Polyfill ResizeObserver for ReactFlow in JSDOM environment
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = globalThis.ResizeObserver || ResizeObserverMock;

