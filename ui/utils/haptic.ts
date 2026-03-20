export function haptic(pattern: number | number[] = 10): void {
  navigator.vibrate?.(pattern)
}
