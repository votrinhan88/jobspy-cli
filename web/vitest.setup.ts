import "@testing-library/jest-dom/vitest";

// happy-dom has no window.confirm, so tests that spy on it need a base function.
if (typeof window.confirm !== "function") window.confirm = () => true;
