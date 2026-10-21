let context: AudioContext | undefined
export async function playSound(volume: number): Promise<void> {
  context ??= new AudioContext()
  if (context.state === 'suspended') await context.resume()
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  oscillator.type = 'sine'
  oscillator.frequency.setValueAtTime(880, context.currentTime)
  oscillator.frequency.exponentialRampToValueAtTime(660, context.currentTime + 0.18)
  gain.gain.setValueAtTime(Math.max(0, Math.min(1, volume / 100)) * 0.16, context.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.28)
  oscillator.connect(gain).connect(context.destination)
  oscillator.start()
  oscillator.stop(context.currentTime + 0.3)
}
