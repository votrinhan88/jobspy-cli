export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerAllSchedules } = await import("@/lib/scheduler");
    await registerAllSchedules();
  }
}
