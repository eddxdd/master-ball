import "@testing-library/jest-dom/vitest";

// jsdom doesn't implement IntersectionObserver — stub it so components that
// use it (e.g. AccountCTABanner's scroll-in fade animation) don't throw
// during render in tests. Only the shape used by our components is covered.
class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

// biome-ignore lint/suspicious/noExplicitAny: stubbing a global not modeled in the jsdom lib types
(globalThis as any).IntersectionObserver = IntersectionObserverStub;

// jsdom lacks matchMedia — Reveal / reduced-motion checks need a stub.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// jsdom implements the Element.scrollIntoView method but throws "Not
// implemented" when it's actually called — stub it as a no-op so components
// that auto-scroll a live-updating list into view (e.g. CoachPage's
// streaming transcript) don't throw during render in tests.
Element.prototype.scrollIntoView = () => {};

// CoachPage's typewriter reveal is time-based on requestAnimationFrame.
// jsdom's rAF is unreliable under Vitest, so drain on a microtask with a
// fake 16ms clock so the chars/sec accumulator actually advances.
let nextRafId = 1;
let fakeNow = 0;
const pendingRafs = new Map<number, FrameRequestCallback>();

globalThis.requestAnimationFrame = (callback: FrameRequestCallback) => {
  const id = nextRafId++;
  pendingRafs.set(id, callback);
  queueMicrotask(() => {
    const cb = pendingRafs.get(id);
    if (!cb) return;
    pendingRafs.delete(id);
    fakeNow += 16;
    cb(fakeNow);
  });
  return id;
};

globalThis.cancelAnimationFrame = (id: number) => {
  pendingRafs.delete(id);
};
