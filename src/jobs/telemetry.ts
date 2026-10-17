import { AsyncLocalStorage } from 'node:async_hooks';
export type RunTelemetry = {
  delayed: boolean;
  reusedScreenshots: boolean;
  pages: number;
  aiCalls: number;
  attention: boolean;
};
const context = new AsyncLocalStorage<RunTelemetry>();
export function beginTelemetry(delayed = false) {
  const value = { delayed, reusedScreenshots: false, pages: 0, aiCalls: 0, attention: false };
  context.enterWith(value);
  return value;
}
export function telemetry() {
  return context.getStore();
}
export function countPage() {
  const value = telemetry();
  if (value) value.pages++;
}
export function countAI() {
  const value = telemetry();
  if (value) value.aiCalls++;
}
export function reusedScreenshots() {
  const value = telemetry();
  if (value) value.reusedScreenshots = true;
}
