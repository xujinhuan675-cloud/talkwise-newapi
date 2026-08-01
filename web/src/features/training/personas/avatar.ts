export function personaInitial(name: string): string {
  return [...name.trim()][0] ?? '?'
}
