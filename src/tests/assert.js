
export function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Test assertion error');
  }
}