import '@testing-library/jest-dom';

// Polyfill ResizeObserver for ReactFlow in JSDOM environment
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = globalThis.ResizeObserver || ResizeObserverMock;

