export function createStalker() {
  const targets = new Set<string>;
  function addTarget(id: string) {
    targets.add(id);
  }
  function removeTarget(id: string) {
    targets.delete(id);
  }
}
