import '@testing-library/jest-dom';

// Polyfill ResizeObserver for ReactFlow in JSDOM environment
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

global.ResizeObserver = global.ResizeObserver || ResizeObserverMock;

