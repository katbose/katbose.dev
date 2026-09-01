import { afterEach, describe, expect, it, vi } from "vitest";

const { init } = vi.hoisted(() => ({ init: vi.fn() }));
const browserListeners = new Map<string, EventListenerOrEventListenerObject>();

vi.mock("@/lib/monitoring/browser-sentry-runtime", () => ({ init }));

function installBrowserGlobals() {
  browserListeners.clear();
  vi.stubGlobal("document", { readyState: "loading" });
  vi.stubGlobal("window", {
    addEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
      browserListeners.set(type, listener);
    }),
    removeEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
      if (browserListeners.get(type) === listener) browserListeners.delete(type);
    }),
    setTimeout: vi.fn(() => 1),
    clearTimeout: vi.fn(),
  });
}

function dispatchBrowserEvent(type: string) {
  const listener = browserListeners.get(type);
  if (typeof listener === "function") listener({ type } as Event);
  else listener?.handleEvent({ type } as Event);
}

async function loadInstrumentationClient(dsn?: string) {
  vi.resetModules();
  init.mockReset();
  installBrowserGlobals();
  vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", dsn ?? "");
  await import("./instrumentation-client");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
  init.mockReset();
  browserListeners.clear();
});

describe("browser Sentry initialisation", () => {
  it("does not load or initialise the runtime without a browser DSN", async () => {
    await loadInstrumentationClient();

    expect(init).not.toHaveBeenCalled();
  });

  it("defers the configured runtime until interaction, then uses error-only options", async () => {
    const dsn = "https://public@example.invalid/1";

    await loadInstrumentationClient(dsn);
    expect(init).not.toHaveBeenCalled();

    dispatchBrowserEvent("pointerdown");

    await vi.waitFor(() => expect(init).toHaveBeenCalledTimes(1));
    expect(init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn,
        sendClientReports: false,
      }),
    );
  });
});
